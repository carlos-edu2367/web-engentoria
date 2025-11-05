# backend/routes/agenda_routes.py

from fastapi import APIRouter, Depends, Query, HTTPException, Form, File, UploadFile
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import extract
from typing import List, Optional
from datetime import date, timedelta
from decimal import Decimal
from calendar import monthrange
from uuid import UUID
from PIL import Image
import io
import uuid, os, logging, unicodedata, re
from ..supabase_client import supabase, gerar_url_assinada, deletar_arquivo_supabase

from .. import models, schemas, auth
from ..config import get_db

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/agenda",
    tags=["Agenda"],
    # Adiciono a dependência de autenticação para todas as rotas neste arquivo.
    dependencies=[Depends(auth.get_current_active_vistoriador)]
)

def compress_image(content: bytes, max_mb: int = 1) -> bytes:
    max_size = max_mb * 1024 * 1024

    # Se a imagem já está no tamanho certo, retorna como está
    if len(content) <= max_size:
        return content

    image = Image.open(io.BytesIO(content))

    # Converte para RGB se necessário (evita erro em PNG com alpha)
    if image.mode in ("RGBA", "P"):
        image = image.convert("RGB")

    quality = 85
    width, height = image.size

    compressed = content

    while len(compressed) > max_size and quality > 30:
        width = int(width * 0.8)
        height = int(height * 0.8)
        resized_img = image.resize((width, height), Image.LANCZOS)

        buffer = io.BytesIO()
        resized_img.save(buffer, format="JPEG", quality=quality)
        compressed = buffer.getvalue()

        quality -= 5

    return compressed

def sanitize_filename(filename):
    # remove acentos
    filename = ''.join(
        c for c in unicodedata.normalize('NFD', filename)
        if unicodedata.category(c) != 'Mn'
    )
    
    # substitui espaços por _
    filename = filename.replace(" ", "_")
    
    # remove caracteres não permitidos
    filename = re.sub(r"[^a-zA-Z0-9._-]", "", filename)

    return filename

@router.get("/", response_model=List[schemas.AgendaVistoriadorDisplay]) # <-- ALTERADO para o novo schema
def read_agenda_do_vistoriador(
    periodo: Optional[str] = Query("hoje", description="Filtre por 'hoje', 'amanha', 'semana', 'mes' ou 'semana_passada'"),
    status_filtro: Optional[str] = Query(None, description="Filtre por 'agendados' ou 'livres'"),
    db: Session = Depends(get_db), 
    current_user: models.Usuario = Depends(auth.get_current_active_vistoriador)
):
    """
    Endpoint principal que retorna a agenda do vistoriador logado.
    Ele é protegido e só pode ser acessado com um token válido.
    Agora com filtros avançados de período e status.
    """
    # Construo a query base para buscar as vistorias.
    query = db.query(models.Agenda).filter(models.Agenda.vistoriador_id == current_user.id, models.Agenda.is_deleted == False)

    # Uso 'joinedload' para otimizar a query.
    query = query.options(
        joinedload(models.Agenda.imovel).joinedload(models.Imovel.imobiliaria),
        joinedload(models.Agenda.imovel).joinedload(models.Imovel.cliente),
        joinedload(models.Agenda.vistoriador)
    )

    # Aplico o filtro de STATUS
    if status_filtro == "agendados":
        tipos_agendados = ['ENTRADA', 'SAIDA', 'CONFERENCIA', 'AVERIGUACAO', 'COMPLEMENTO_VISITA', 'IMPRODUTIVA']
        query = query.filter(models.Agenda.tipo.in_(tipos_agendados))
    elif status_filtro == "livres":
        query = query.filter(models.Agenda.tipo == 'LIVRE')

    # Aplico os filtros de PERÍODO
    today = date.today()
    if periodo == "hoje":
        query = query.filter(models.Agenda.data == today)

    elif periodo == "amanha":
        tomorrow = today + timedelta(days=1)
        query = query.filter(models.Agenda.data == tomorrow)

    elif periodo == "semana":
        # Segunda-feira da semana atual
        start_of_week = today - timedelta(days=today.weekday())
        # Domingo da semana atual
        end_of_week = start_of_week + timedelta(days=6)
        query = query.filter(models.Agenda.data.between(start_of_week, end_of_week))

    elif periodo == "mes":
        # Primeiro dia do mês atual
        start_of_month = today.replace(day=1)
        # Último dia do mês atual
        last_day = monthrange(today.year, today.month)[1]
        end_of_month = today.replace(day=last_day)
        query = query.filter(models.Agenda.data.between(start_of_month, end_of_month))

    elif periodo == "semana_passada":
        # Segunda-feira da semana passada
        start_of_last_week = today - timedelta(days=today.weekday() + 7)
        # Domingo da semana passada
        end_of_last_week = start_of_last_week + timedelta(days=6)
        query = query.filter(models.Agenda.data.between(start_of_last_week, end_of_last_week))
    
    # Ordeno os resultados por data e horário.
    vistorias = query.order_by(models.Agenda.data, models.Agenda.horario).all()

    return vistorias

@router.get("/meu-relatorio", response_model=schemas.RelatorioVistoriador, summary="Gerar relatório mensal para o vistoriador logado")
def get_meu_relatorio_vistoriador(
    mes: int = Query(..., ge=1, le=12),
    ano: int = Query(..., ge=2020),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(auth.get_current_active_vistoriador)
):
    """
    Gera um relatório de comissões para o vistoriador logado,
    detalhando as vistorias normais e improdutivas por imobiliária.
    """
    # Busca vistorias normais (não-improdutivas) do vistoriador no período
    vistorias_normais = db.query(models.Agenda).filter(
        models.Agenda.vistoriador_id == current_user.id,
        extract('year', models.Agenda.data) == ano,
        extract('month', models.Agenda.data) == mes,
        models.Agenda.tipo.in_(['ENTRADA', 'SAIDA', 'CONFERENCIA', 'AVERIGUACAO', 'COMPLEMENTO_VISITA'])
    ).options(
        joinedload(models.Agenda.imovel).joinedload(models.Imovel.imobiliaria)
    ).order_by(models.Agenda.data.asc()).all()

    # Busca vistorias improdutivas do vistoriador no período
    improdutivas = db.query(models.VistoriaImprodutiva).join(
        models.Agenda, models.VistoriaImprodutiva.agenda_id_original == models.Agenda.id
    ).options(
        joinedload(models.VistoriaImprodutiva.imovel) # Carrega o imóvel para pegar o cod_imovel
    ).filter(
        models.Agenda.vistoriador_id == current_user.id,
        extract('year', models.VistoriaImprodutiva.data_vistoria_original) == ano,
        extract('month', models.VistoriaImprodutiva.data_vistoria_original) == mes,
        models.VistoriaImprodutiva.is_deleted == False
    ).order_by(models.Agenda.data.asc()).all()

    vistorias_por_imobiliaria = {}
    total_comissao_vistorias = Decimal(0)
    for v in vistorias_normais:
        if v.imovel and v.imovel.imobiliaria:
            imob_nome = v.imovel.imobiliaria.nome
            if imob_nome not in vistorias_por_imobiliaria:
                vistorias_por_imobiliaria[imob_nome] = []
            
            vistorias_por_imobiliaria[imob_nome].append(schemas.RelatorioVistoriaItem(
                data=v.data,
                cod_imovel=v.imovel.cod_imovel,
                endereco=v.imovel.endereco,
                tamanho=v.imovel.tamanho,
                tipo_mobilia=v.imovel.mobiliado,
                tipo_vistoria=v.tipo,
                valor=v.valor_final_vistoria or 0,
                comissao_vistoriador=v.valor_vistoriador or 0,
                observacao_vistoriador=v.observacao_vistoriador
            ))
            total_comissao_vistorias += v.valor_vistoriador or 0

    improdutivas_formatadas = []
    total_comissao_improdutivas = Decimal(0)
    for i in improdutivas:
        improdutivas_formatadas.append(schemas.RelatorioImprodutivaItem(
            data_vistoria_original=i.data_vistoria_original,
            cod_imovel=i.imovel.cod_imovel if i.imovel else "N/A",
            motivo_improdutividade=i.motivo_improdutividade or "N/A",
            valor_cobrado=i.valor_cobranca or 0,
            comissao_vistoriador=i.valor_para_vistoriador or 0
        ))
        total_comissao_improdutivas += i.valor_para_vistoriador or 0

    return schemas.RelatorioVistoriador(
        vistoriador_nome=current_user.nome,
        periodo=f"{mes:02d}/{ano}",
        vistorias_por_imobiliaria=vistorias_por_imobiliaria,
        improdutivas=improdutivas_formatadas,
        total_comissao_vistorias=total_comissao_vistorias,
        total_comissao_improdutivas=total_comissao_improdutivas,
        total_geral_comissao=total_comissao_vistorias + total_comissao_improdutivas
    )


@router.post("/adicionar_documento_agendamento")
async def add_documento_agendamento(id_agendamento: str = Form(...),
                                    file: UploadFile = File(...),
                                    session: Session = Depends(get_db),
                                    current_user: models.Usuario = Depends(auth.get_current_active_vistoriador)):
    try:
        agendamento_id = UUID(id_agendamento)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    agendamento = session.query(models.Agenda).filter(models.Agenda.id == agendamento_id).first()
    if not agendamento:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")
    
    if agendamento.vistoriador_id != current_user.id:
        raise HTTPException(status_code=403, detail="Usuário não autorizado")
    
    config = session.query(models.Configuracao).first()
    qtd_documentos = session.query(models.DocumentoAgenda).filter(models.DocumentoAgenda.agenda_id == agendamento.id).count()
    if qtd_documentos >= config.max_arquivos:
         raise HTTPException(status_code=400, detail="Limite de documentos atingido")
    
    nome, extensao = os.path.splitext(file.filename)
    nome = sanitize_filename(nome)
    nome_arquivo = f"{nome}-CODIGO-{uuid.uuid4()}{extensao}"

    if not extensao.lower() in [".jpg", ".png", ".jpeg", ".pdf"]:
            raise HTTPException(status_code=400, detail="Tipo de imagem não aceita")
    
    try:
        conteudo = await file.read()
        MAX_MB = 50

        if len(conteudo) > MAX_MB * 1024 * 1024:
                raise HTTPException(status_code=400, detail="Imagem ultrapassa o tamanho máximo: 50mb")
        
        res = supabase.storage.from_("documentos").upload(nome_arquivo, 
                                                          conteudo,
                                                          {"content-type": file.content_type})
        if getattr(res, "error", None):
                logger.error(f"Erro no Supabase: {res.error}")
                raise HTTPException(status_code=400, detail="Erro ao enviar documento para o servidor")
        new = models.DocumentoAgenda(file_path=nome_arquivo, 
                                     agenda_id=agendamento.id,
                                     usuario_id=current_user.id)
        session.add(new)
        session.commit()
        return
    except Exception as e:
         logger.error(f"Erro ao adicionar imagem: {e}")
         session.rollback()
         raise HTTPException(status_code=500, detail="Erro no servidor ao adicionar imagem")
    
@router.get("/listar_documentos_agenda/{id_agendamento}")
async def listar_documentos_agenda(id_agendamento: str, 
                                   session: Session = Depends(get_db),
                                    current_user: models.Usuario = Depends(auth.get_current_active_vistoriador)):
    try:
        agendamento_id = UUID(id_agendamento)
    except:
         raise HTTPException(status_code=400, detail="ID inválido")
    
    agendamento = (session.query(models.Agenda)
                   .options(joinedload(models.Agenda.documentos))
                   .filter(models.Agenda.id == agendamento_id).first())
    if not agendamento:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")
    if agendamento.vistoriador_id != current_user.id:
        raise HTTPException(status_code=403, detail="Usuário não autorizado")
    
    docs = sorted(agendamento.documentos, key=lambda d: d.created_at, reverse=True)

    
    return {
        "documentos":[{
             "id": documento.id,
             "nome": documento.file_path,
             "link": gerar_url_assinada(bucket="documentos", 
                                        file_path=documento.file_path)
        }for documento in docs]
    }


@router.delete("/deletar_documento/{id_documento}")
async def deletar_documento(id_documento: str, 
                            session: Session = Depends(get_db),
                            current_user: models.Usuario = Depends(auth.get_current_active_vistoriador)):
     
    try:
        documento_id = UUID(id_documento)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    documento = session.query(models.DocumentoAgenda).filter(models.DocumentoAgenda.id == documento_id).first()
    if not documento:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    
    if not documento.usuario_id or documento.usuario_id != current_user.id:
        raise HTTPException(status_code=403, detail="Usuário não autorizado")
    
    try:
        if deletar_arquivo_supabase(file_path=documento.file_path, bucket="documentos"):
            session.delete(documento)
            session.commit()
        else:
            raise HTTPException(status_code=500, detail="Erro ao deletar arquivo")
        
    except Exception as e:
        session.rollback()
        logger.error(f"Erro ao deletar arquivo: {e}")
        raise HTTPException(status_code=500, detail="Erro ao deletar arquivo")

@router.get("/ver_comentarios/{id_agenda}")
async def ver_comentarios(id_agenda: str, 
                            session: Session = Depends(get_db),
                            current_user: models.Usuario = Depends(auth.get_current_active_vistoriador)):
    # Vamos chamar de Mural do agendamento
    try:
        agenda_id = UUID(id_agenda)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    agenda = (session.query(models.Agenda)
              .options(joinedload(models.Agenda.comentarios))
              .filter(models.Agenda.id == agenda_id, 
                      models.Agenda.vistoriador_id == current_user.id)
                      .first())
    if not agenda:
        raise HTTPException(status_code=404, detail="Agenda não encontrada")
    
    comentarios = sorted(agenda.comentarios, key=lambda d: d.created_at, reverse=False)

    return {
        "comentarios":[{
            "id": c.id,
            "conteudo": c.conteudo,
            "remetente": c.remetente,
            "created_at": c.created_at,
        } for c in comentarios]
    }

@router.post("/adicionar_comentario/{id_agenda}")
async def adc_comentario_mural( id_agenda: str, comentario: str,
                                session: Session = Depends(get_db),
                                current_user: models.Usuario = Depends(auth.get_current_active_vistoriador)):
    try:
        agenda_id = UUID(id_agenda)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    agenda = (session.query(models.Agenda)
              .filter(models.Agenda.id == agenda_id, 
                      models.Agenda.vistoriador_id == current_user.id).first())
    if not agenda:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")
    
    new = models.ComentarioVistoria(agenda_id=agenda.id, conteudo=comentario, remetente="vistoriador")
    try:
        session.add(new)
        session.commit()
        return
    except Exception as e:
        raise HTTPException(status_code=500, detail="Erro ao adicionar comentário")
    

@router.post("/laudos/laudo")
async def criar_laudo(id_agendamento: str,
                      session: Session = Depends(get_db),
                      current_user: models.Usuario = Depends(auth.get_current_active_vistoriador)):
    try:
        agenda_id = UUID(id_agendamento)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    agenda = session.query(models.Agenda).filter(models.Agenda.id == agenda_id, models.Agenda.vistoriador_id == current_user.id).first()
    if not agenda:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado para o usuário")
    
    existe = session.query(models.Laudo).filter(models.Laudo.agenda_id == agenda.id).first()
    if existe:
        raise HTTPException(status_code=409, detail="Já Existe um laudo para esse agendamento")
    
    new = models.Laudo(agenda_id=agenda.id, 
                       imovel_id=agenda.imovel_id, 
                       imobiliaria_id=agenda.imovel.imobiliaria_id,
                       user_id=current_user.id)
    try:
        session.add(new)
        session.commit()
        return {
            "status": "ok",
            "mensagem": "Laudo criado com sucesso",
            "id": new.id
        }
    except Exception as e:
        session.rollback()
        logger.error(f"Erro ao criar laudo: {e}")
        raise HTTPException(status_code=500, detail="Erro ao criar laudo")
    
@router.post("/laudos/{laudo_id}/categoria")
async def criar_categoria(laudo_id: str,
                          titulo: str,
                          session: Session = Depends(get_db),
                          current_user: models.Usuario = Depends(auth.get_current_active_vistoriador)):
    try:
        id_laudo = UUID(laudo_id)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    laudo = (session.query(models.Laudo)
             .filter(models.Laudo.id == id_laudo, 
                     models.Laudo.vistoriador_id == current_user.id)
             .first())
    if not laudo:
        raise HTTPException(status_code=404, detail="Laudo não encontrado para o usuário")
    
    if laudo.finalizado:
        raise HTTPException(status_code=400, detail="Não é possivel editar um laudo finalizado")

    new = models.CategoriaLaudo(laudo_id=laudo.id, titulo=titulo)
    try:
        session.add(new)
        session.commit()
        return {
            "id": new.id,
            "titulo": new.titulo
        }
    except Exception as e:
        session.rollback()
        logger.error(f"Erro ao criar categoria: {e}")
        raise HTTPException(status_code=500, detail="Erro ao criar categoria")
    
@router.post("/laudos/categoria/{id_categoria}/item")
async def criar_item(id_categoria: str,
                     descricao: str,
                     session: Session = Depends(get_db),
                     current_user: models.Usuario = Depends(auth.get_current_active_vistoriador)):
    try:
        categoria_id = UUID(id_categoria)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    categoria = (session.query(models.CategoriaLaudo)
                 .join(models.CategoriaLaudo.laudo)
                 .filter(models.CategoriaLaudo.id == categoria_id,
                         models.Laudo.vistoriador_id == current_user.id)
                 .first())
    if not categoria:
        raise HTTPException(status_code=404, detail="Categoria não encontrada")
    
    if categoria.laudo.finalizado:
        raise HTTPException(status_code=400, detail="Não é possivel editar um laudo finalizado")
    
    new = models.ItemCategoria(categoria_id=categoria.id, descricao=descricao)
    try:
        session.add(new)
        session.commit()
        return {
            "id": new.id,
            "descricao": new.descricao
        }
    except Exception as e:
        session.rollback()
        logger.error(f"Erro ao adicionar item: {e}")
        raise HTTPException(status_code=500, detail="Erro ao adicionar item")
    
@router.post("/laudos/categoria/imagem")
async def add_imagem_categoria(id_categoria: str = Form(...),
                               imagem: UploadFile = File(...),
                               session: Session = Depends(get_db),
                               current_user: models.Usuario = Depends(auth.get_current_active_vistoriador)):
    try:
        categoria_id = UUID(id_categoria)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    categoria = (session.query(models.CategoriaLaudo)
                 .join(models.CategoriaLaudo.laudo)
                 .filter(models.CategoriaLaudo.id == categoria_id,
                         models.Laudo.vistoriador_id == current_user.id)
                 .first())
    if not categoria:
        raise HTTPException(status_code=404, detail="Categoria não encontrada para o usuário")
    
    if categoria.laudo.finalizado:
        raise HTTPException(status_code=400, detail="Não é possivel editar um laudo finalizado")

    nome, extensao = os.path.splitext(imagem.filename)
    nome = sanitize_filename(nome)
    nome_arquivo = f"{nome}_Img_{uuid.uuid4()}{extensao}"

    if not extensao.lower() in [".jpg", ".jpeg", ".png", ".webp"]:
        raise HTTPException(status_code=400, detail="Tipo de arquivo inválido, somente imagens")
    
    try:
        conteudo = await imagem.read()
        MAX_MB = 1

        if len(conteudo) > MAX_MB * 1024 * 1024:
            conteudo = compress_image(content=conteudo)

        res = supabase.storage.from_("imagens").upload(nome_arquivo, 
                                                          conteudo,
                                                          {"content-type": imagem.content_type})
        if getattr(res, "error", None):
                logger.error(f"Erro no Supabase: {res.error}")
                raise HTTPException(status_code=400, detail="Erro ao enviar documento para o servidor")
        
        new = models.ImagemCategoria(categoria_id=categoria.id, file_path=nome_arquivo)
        session.add(new)
        session.commit()
        return
    except Exception as e:
        session.rollback()
        logger.error(f"Erro ao add imagem: {e}")
        raise HTTPException(status_code=500, detail="Erro ao adicionar imagem")
    
@router.get("/laudos/laudo/{id_agendamento}")
async def ver_laudo_agendamento(id_agendamento: str,
                                session: Session = Depends(get_db),
                                current_user: models.Usuario = Depends(auth.get_current_active_vistoriador)):
    try:
        agenda_id = UUID(id_agendamento)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    laudo = (session.query(models.Laudo)
             .options(joinedload(models.Laudo.categorias))
             .filter(models.Laudo.agenda_id == agenda_id,
                     models.Laudo.vistoriador_id == current_user.id)
             .first())
    if not laudo:
        raise HTTPException(status_code=404, detail="Nenhum laudo encontrado")
    
    categorias = sorted(laudo.categorias, key=lambda d: d.created_at, reverse=True)
    
    return {
        "id": laudo.id,
        "created_at": laudo.created_at,
        "nome_vistoriador": laudo.vistoriador.nome,
        "nome_imobiliaria": laudo.imobiliaria.nome,
        "codigo_imovel": laudo.imovel.cod_imovel,
        "finalizado": laudo.finalizado,
        "aprovado": laudo.aprovado,
        "obs": laudo.obs_adm,
        "categorias": [{
            "id": c.id,
            "titulo": c.titulo,
            "created_at": c.created_at
        }for c in categorias]
    }

@router.get("/laudos/categoria/{id_categoria}")
async def ver_categoria(id_categoria: str,
                        session: Session = Depends(get_db),
                        current_user: models.Usuario = Depends(auth.get_current_active_vistoriador)):
    try:
        categoria_id = UUID(id_categoria)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    categoria = (session.query(models.CategoriaLaudo)
                 .options(joinedload(models.CategoriaLaudo.laudo),
                          joinedload(models.CategoriaLaudo.imagens),
                          joinedload(models.CategoriaLaudo.itens))
                 .filter(models.CategoriaLaudo.id == categoria_id).first())
    if not categoria:
        raise HTTPException(status_code=404, detail="Categoria não encontrada")
    
    if categoria.laudo.vistoriador_id != current_user.id:
        raise HTTPException(status_code=403, detail="Usuário não autorizado")

    itens = sorted(categoria.itens, key=lambda d: d.created_at, reverse=True)
    imagens = categoria.imagens

    return {
        "id": categoria.id,
        "titulo": categoria.titulo,
        "created_at": categoria.created_at,
        "itens": [{
            "id": i.id,
            "descricao": i.descricao,
            "created_at": i.created_at
        }for i in itens],
        "imagens": [{
            "id": i.id,
            "file_path": i.file_path,
            "link": gerar_url_assinada(bucket="imagens", file_path=i.file_path)
        }for i in imagens]
    }

@router.put("/laudos/laudo/status")
async def atualizar_status_laudo(id_laudo: str,
                                 finalizado: bool,
                                 session: Session = Depends(get_db),
                                 current_user: models.Usuario = Depends(auth.get_current_active_vistoriador)):
    try:
        laudo_id = UUID(id_laudo)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    laudo = session.query(models.Laudo).filter(models.Laudo.id == laudo_id).first()
    if not laudo:
        raise HTTPException(status_code=404, detail="Laudo não encontrado")
    
    laudo.finalizado = finalizado
    laudo.aprovado = False
    try:
        session.commit()
        return
    except Exception as e:
        logger.error(f"Erro ao atualizar status do laudo: {e}")
        session.rollback()
        raise HTTPException(status_code=500, detail="Erro ao atualizar laudo")
    
@router.delete("/laudos/categoria/{id_categoria}")
async def deletar_categoria(id_categoria: str,
                            session: Session = Depends(get_db),
                            current_user: models.Usuario = Depends(auth.get_current_active_vistoriador)):
    try:
        categoria_id = UUID(id_categoria)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    categoria = (session.query(models.CategoriaLaudo)
                 .join(models.CategoriaLaudo.laudo)
                 .filter(models.CategoriaLaudo.id == categoria_id, 
                         models.Laudo.vistoriador_id == current_user.id)
                 .first())
    if not categoria:
        raise HTTPException(status_code=404, detail="Categoria não encontrada")
    
    if categoria.laudo.finalizado:
        raise HTTPException(status_code=400, detail="Não é possivel editar um laudo finalizado")
    

    try:
        session.delete(categoria)
        session.commit()
        return
    except Exception as e:
        session.rollback()
        logger.error(f"Erro ao deletar categoria: {e}")
        raise HTTPException(status_code=500, detail="Erro ao deletar categoria")
    
@router.delete("/laudos/item/{id_item}")
async def deletar_item(id_item: str,
                       session: Session = Depends(get_db),
                       current_user: models.Usuario = Depends(auth.get_current_active_vistoriador)):
    try:
        item_id = UUID(id_item)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    item = session.query(models.ItemCategoria).filter(models.ItemCategoria.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    
    if item.categoria.laudo.finalizado:
        raise HTTPException(status_code=400, detail="Não é possivel editar um laudo finalizado")

    if item.categoria.laudo.vistoriador_id != current_user.id:
        raise HTTPException(status_code=403, detail="Usuário não autorizado")

    try:
        session.delete(item)
        session.commit()
        return
    except Exception as e:
        logger.info(f"Erro ao deletar item: {e}")
        session.rollback()
        raise HTTPException(status_code=500, detail="Erro ao deletar item")
    
@router.delete("/laudos/imagem/{id_imagem}")
async def deletar_imagem_laudo(id_imagem: str,
                               session: Session = Depends(get_db),
                               current_user: models.Usuario = Depends(auth.get_current_active_vistoriador)):
    try:
        imagem_id = UUID(id_imagem)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    imagem = session.query(models.ImagemCategoria).filter(models.ImagemCategoria.id == imagem_id).first()
    if not imagem:
        raise HTTPException(status_code=404, detail="Imagem não encontrada")
    
    if imagem.categoria.laudo.vistoriador_id != current_user.id:
        raise HTTPException(status_code=403, detail="Usuário não autorizado")
    
    try:
        deletar_arquivo_supabase(file_path=imagem.file_path, bucket="imagens")
        session.delete(imagem)
        session.commit()
        return
    except Exception as e:
        session.rollback()
        logger.error(f"Erro ao deletar arquivo: {e}")
        raise HTTPException(status_code=500, detail="Erro ao deletar imagem")
    
@router.get("/laudos/pendencias")
async def listar_pendencias(session: Session = Depends(get_db),
                            current_user: models.Usuario = Depends(auth.get_current_active_vistoriador)):
    
    laudos_pendentes = (session.query(models.Laudo)
                        .options(joinedload(models.Laudo.imovel),
                                 joinedload(models.Laudo.imobiliaria))
                        .filter(models.Laudo.finalizado == False,
                                models.Laudo.vistoriador_id == current_user.id)
                        .order_by(models.Laudo.created_at.asc()).all())
    if not laudos_pendentes:
        return {
            "pendentes": []
        }
    
    return {
        "pendentes": [{
            "id": laudo.id,
            "agenda_id": laudo.agenda_id,
            "cod_imovel": laudo.imovel.cod_imovel,
            "imobiliaria": laudo.imobiliaria.nome,
            "created_at": laudo.created_at
        }for laudo in laudos_pendentes]
    }

@router.get("/laudos/qtd_pendente")
async def qtd_pendencias(session: Session = Depends(get_db),
                            current_user: models.Usuario = Depends(auth.get_current_active_vistoriador)):
    
    laudos_pendentes = (session.query(models.Laudo)
                        .filter(models.Laudo.finalizado == False,
                                models.Laudo.vistoriador_id == current_user.id)
                        .count())
    return {
        "qtd": laudos_pendentes
    }