# backend/backfill_valores_agenda.py
import sys
import os
from sqlalchemy.orm import Session, joinedload
from decimal import Decimal

# Adiciona o diretório raiz ao path para permitir importações relativas
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend import models
from backend.config import get_db

# --- Lógica de Negócio ---
# As funções de cálculo foram copiadas de 'admin_panel_routes.py' para tornar este script autônomo.

def _calculate_valor_final_vistoria(imovel: models.Imovel, tipo_vistoria: str) -> float:
    """Calcula o valor FINAL (cobrado) da vistoria com base no tipo."""
    if tipo_vistoria == 'AVERIGUACAO':
        return 65.00

    valor_base = float(imovel.valor) # Usa o valor base já calculado no imóvel
    
    if tipo_vistoria in ['CONFERENCIA', 'COMPLEMENTO_VISITA']:
        return round(valor_base * 0.5, 2)
    else: # ENTRADA, SAIDA
        return round(valor_base, 2)

def _calculate_valor_comissao_vistoriador(tamanho_m2: float, mobiliado_status: str, tipo_vistoria_agenda: str) -> float:
    """Calcula o valor da COMISSÃO do vistoriador com base nas regras."""
    tamanho_m2 = float(tamanho_m2)
    if tipo_vistoria_agenda == 'AVERIGUACAO':
        return 65.00
    
    valor_base = 0.0
    if mobiliado_status == 'mobiliado':
        if tamanho_m2 < 50: valor_base = 65.00
        elif 50 <= tamanho_m2 < 100: valor_base = tamanho_m2 * 1.25
        elif 100 <= tamanho_m2 <= 140: valor_base = 125.00
        else: valor_base = tamanho_m2 * 0.90
    elif mobiliado_status in ['sem_mobilia', 'semi_mobiliado']:
        if tamanho_m2 < 50: valor_base = 50.00
        elif 50 <= tamanho_m2 < 100: valor_base = tamanho_m2 * 1.00
        elif 100 <= tamanho_m2 <= 135: valor_base = 100.00
        else: valor_base = tamanho_m2 * 0.75
    else:
        return 0.0

    valor_final = valor_base
    if tipo_vistoria_agenda in ['CONFERENCIA', 'COMPLEMENTO_VISITA']:
        valor_final = valor_base * 0.5
        if valor_final < 45.00:
            valor_final = 45.00
        
    return round(valor_final, 2)

def run_backfill():
    """
    Executa o processo de backfill para atualizar os valores de vistorias antigas na tabela de agenda.
    """
    print("Iniciando script de backfill para valores de vistoria...")
    db: Session = next(get_db())
    
    try:
        # Busca agendamentos que são vistorias (não livres/fechados), possuem imóvel, mas não têm os novos valores.
        agendamentos_para_atualizar = db.query(models.Agenda).options(
            joinedload(models.Agenda.imovel).joinedload(models.Imovel.imobiliaria)
        ).filter(
            models.Agenda.imovel_id.isnot(None),
            models.Agenda.valor_final_vistoria.is_(None),
            models.Agenda.tipo.in_(['ENTRADA', 'SAIDA', 'CONFERENCIA', 'AVERIGUACAO', 'COMPLEMENTO_VISITA'])
        ).all()

        if not agendamentos_para_atualizar:
            print("Nenhum agendamento antigo para atualizar. O banco de dados já está consistente.")
            return

        print(f"Encontrados {len(agendamentos_para_atualizar)} agendamentos para recalcular.")
        
        count_atualizados = 0
        for agendamento in agendamentos_para_atualizar:
            imovel = agendamento.imovel
            
            # Pula se o imóvel associado não existir mais (dado órfão)
            if not imovel:
                print(f"  - [AVISO] Agendamento ID {agendamento.id} sem imóvel associado. Pulando.")
                continue

            print(f"  - Processando Agendamento ID: {agendamento.id} (Imóvel {imovel.cod_imovel})")

            # Calcula os novos valores usando a lógica de negócio
            valor_final = _calculate_valor_final_vistoria(imovel, agendamento.tipo)
            valor_comissao = _calculate_valor_comissao_vistoriador(imovel.tamanho, imovel.mobiliado, agendamento.tipo)
            
            # Atualiza o objeto do agendamento
            agendamento.valor_final_vistoria = Decimal(str(valor_final))
            agendamento.valor_vistoriador = Decimal(str(valor_comissao))
            
            print(f"    => Valor Final Calculado: R$ {valor_final:.2f}")
            print(f"    => Comissão Calculada: R$ {valor_comissao:.2f}")
            count_atualizados += 1

        print("\nTodos os valores foram calculados. Salvando alterações no banco de dados...")
        db.commit()
        print(f"\nConcluído! {count_atualizados} registros de agendamento foram atualizados com sucesso.")

    except Exception as e:
        print(f"\n[ERRO] Ocorreu um erro durante o processo: {e}")
        print("As alterações foram revertidas (rollback).")
        db.rollback()
    finally:
        print("Fechando conexão com o banco de dados.")
        db.close()

if __name__ == "__main__":
    run_backfill()