# backend/routes/agenda_routes.py

from fastapi import APIRouter, Depends, Query, HTTPException, Form, File, UploadFile
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import extract
from typing import List, Optional
from datetime import date, timedelta
from decimal import Decimal
from calendar import monthrange
from uuid import UUID
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