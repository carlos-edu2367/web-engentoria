import sys
import os

# Adiciona a pasta do projeto ao path para permitir a importação dos módulos do backend
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from backend.config import SessionLocal
from backend.models import Usuario, GrupoImobiliaria, UsuarioTI
from backend.auth import get_password_hash

def reset_all_passwords():
    """
    Este script redefine a senha de todos os usuários para um valor padrão,
    garantindo que todas as senhas no banco de dados estejam corretamente "hasheadas".
    """
    db = SessionLocal()
    
    # Senha padrão para todos os usuários
    default_password = "123123"
    hashed_password = get_password_hash(default_password)
    
    print("Iniciando a redefinição de senhas...")
    print(f"A nova senha padrão para todos os usuários será: '{default_password}'")
    
    total_updated = 0
    
    try:
        # 1. Atualiza senhas para a tabela 'usuarios' (Vistoriadores e Admins)
        users_app = db.query(Usuario).all()
        if users_app:
            print(f"\nAtualizando {len(users_app)} senhas na tabela 'usuarios'...")
            for user in users_app:
                user.senha = hashed_password
            total_updated += len(users_app)
            print("OK.")

        # 2. Atualiza senhas para a tabela 'grupos_imobiliarias'
        users_group = db.query(GrupoImobiliaria).all()
        if users_group:
            print(f"\nAtualizando {len(users_group)} senhas na tabela 'grupos_imobiliarias'...")
            for user in users_group:
                user.senha = hashed_password
            total_updated += len(users_group)
            print("OK.")
            
        # 3. Atualiza senhas para a tabela 'usuarios_ti'
        users_ti = db.query(UsuarioTI).all()
        if users_ti:
            print(f"\nAtualizando {len(users_ti)} senhas na tabela 'usuarios_ti'...")
            for user in users_ti:
                user.senha = hashed_password
            total_updated += len(users_ti)
            print("OK.")

        # Salva todas as alterações no banco de dados
        db.commit()
        
        print("\n----------------------------------------------------")
        print(f"SUCESSO! Senhas de {total_updated} usuários foram redefinidas.")
        print("----------------------------------------------------")

    except Exception as e:
        print(f"\nERRO: Ocorreu um problema durante a atualização. Nenhuma senha foi alterada.")
        print(f"Detalhe: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    # Confirmação do usuário para evitar execução acidental
    confirm = input("ATENÇÃO: Este script irá redefinir a senha de TODOS os usuários para '123123'.\nVocê tem certeza que deseja continuar? (s/n): ")
    if confirm.lower() == 's':
        reset_all_passwords()
    else:
        print("Operação cancelada.")

