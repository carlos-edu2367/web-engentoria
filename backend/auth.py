# backend/auth.py

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from passlib.exc import UnknownHashError
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import secrets
from .email_utils import send_email
from sendgrid.helpers.mail import Mail

from . import models, schemas
from .config import settings, get_db

# Hashing de Senha
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Esquema OAuth2
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")

# --- Utilitários de Senha ---

def verify_password(plain_password, hashed_password):
    """Verifica se a senha fornecida corresponde ao hash armazenado."""
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except UnknownHashError:
        return False

def get_password_hash(password):
    """Gera o hash de uma senha, garantindo que não exceda o limite do bcrypt."""
    # O bcrypt tem um limite de 72 bytes. Truncamos a senha para evitar erros.
    return pwd_context.hash(password[:72])

# --- Utilitários de Token JWT (Acesso) ---

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    """Cria um novo token de acesso JWT."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    # CORREÇÃO: Usar os nomes corretos das variáveis de settings
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

# --- Lógica de Recuperação de Senha ---

def generate_reset_token():
    """Gera um token seguro e aleatório para a redefinição de senha."""
    return secrets.token_hex(32)

def send_password_reset_email(email_to: str, token: str):
    """Envia o e-mail de redefinição de senha usando Mailgun."""
    reset_link = f"{settings.FRONTEND_URL}/redefinir-senha.html?token={token}"

    # Modo desenvolvimento (sem Mailgun configurado)
    if not settings.MAILGUN_API_KEY:
        print("--- MODO DE DESENVOLVIMENTO ---")
        print(f"Link para redefinição de senha para {email_to}:")
        print(reset_link)
        print("-------------------------------")
        return

    html = f"""
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8" />
        <title>Recuperação de Senha</title>
    </head>
    <body style="
        margin: 0;
        padding: 0;
        background-color: #0f172a;
        font-family: Arial, Helvetica, sans-serif;
        color: #e5e7eb;
    ">
        <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
                <td align="center" style="padding: 40px 0;">
                    <table width="600" cellpadding="0" cellspacing="0" style="
                        background-color: #020617;
                        border-radius: 12px;
                        overflow: hidden;
                        box-shadow: 0 10px 30px rgba(0,0,0,0.4);
                    ">
                        <tr>
                            <td style="
                                background: linear-gradient(135deg, #22d3ee, #22c55e);
                                padding: 24px;
                                text-align: center;
                                color: #022c22;
                                font-size: 22px;
                                font-weight: bold;
                            ">
                                ENGENTORIA
                            </td>
                        </tr>

                        <tr>
                            <td style="padding: 32px;">
                                <p style="font-size: 16px; margin-bottom: 16px;">
                                    Olá,
                                </p>

                                <p style="font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
                                    Recebemos uma solicitação para redefinir a senha da sua conta.
                                    Para continuar, clique no botão abaixo:
                                </p>

                                <div style="text-align: center; margin: 32px 0;">
                                    <a href="{reset_link}"
                                       style="
                                            background: linear-gradient(135deg, #22d3ee, #22c55e);
                                            color: #022c22;
                                            padding: 14px 28px;
                                            text-decoration: none;
                                            border-radius: 8px;
                                            font-weight: bold;
                                            display: inline-block;
                                       ">
                                        Redefinir minha senha
                                    </a>
                                </div>

                                <p style="font-size: 14px; color: #94a3b8; line-height: 1.6;">
                                    ⏱️ Este link expira em <strong>15 minutos</strong>.
                                </p>

                                <p style="font-size: 14px; color: #94a3b8; line-height: 1.6; margin-top: 16px;">
                                    Se você não solicitou essa alteração, pode ignorar este e-mail com segurança.
                                </p>
                            </td>
                        </tr>

                        <tr>
                            <td style="
                                background-color: #020617;
                                padding: 20px;
                                text-align: center;
                                font-size: 12px;
                                color: #64748b;
                            ">
                                © {settings.APP_NAME} • Todos os direitos reservados
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """

    try:
        send_email(
            to=email_to,
            subject="Recuperação de Senha",
            html=html
        )
        print(f"E-mail de recuperação enviado para {email_to}")
    except Exception as e:
        print(f"Erro ao enviar e-mail de recuperação para {email_to}: {e}")

def get_password_reset_token(db: Session, token: str):
    """Busca um token de redefinição no banco de dados."""
    return db.query(models.PasswordResetToken).filter(models.PasswordResetToken.token == token).first()

# --- Funções de Autenticação e Autorização (Depends) ---

def get_user(db: Session, email: str):
    """Busca um usuário em qualquer uma das tabelas de autenticação."""
    user = db.query(models.Usuario).filter(models.Usuario.email == email, models.Usuario.is_deleted == False).first()
    if user:
        return user
    
    user = db.query(models.GrupoImobiliaria).filter(models.GrupoImobiliaria.email == email, models.GrupoImobiliaria.is_deleted == False).first()
    if user:
        return user

    user = db.query(models.UsuarioImobiliaria).join(models.GrupoImobiliaria).filter(
        models.UsuarioImobiliaria.email == email,
        models.GrupoImobiliaria.is_deleted == False
    ).first()
    if user:
        return user
        
    user = db.query(models.UsuarioTI).filter(models.UsuarioTI.email == email).first()
    if user:
        return user

    return None

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Decodifica o token e retorna o usuário logado."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Não foi possível validar as credenciais",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        # CORREÇÃO: Usar os nomes corretos das variáveis de settings
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
        token_data = schemas.TokenData(email=email)
    except JWTError:
        raise credentials_exception
    
    user = get_user(db, email=token_data.email)
    if user is None:
        raise credentials_exception
    return resolver_login_imobiliaria(user)

def resolver_login_imobiliaria(user):
    """
    Usuários adicionais de um grupo agem como o próprio grupo: as rotas da imobiliária
    usam current_user.id como grupo_id. Devolve o grupo com o usuário em usuario_logado,
    de onde GrupoImobiliaria.permissoes lê as permissões.
    """
    if isinstance(user, models.UsuarioImobiliaria):
        grupo = user.grupo
        grupo.usuario_logado = user
        return grupo
    if isinstance(user, models.GrupoImobiliaria):
        # A instância pode vir do identity map da sessão; limpa um valor anterior.
        user.usuario_logado = None
    return user

# Funções de dependência específicas para tipos de usuário
# Elas garantem que apenas usuários do tipo certo acessem determinados endpoints.

def get_current_active_vistoriador(current_user: models.Usuario = Depends(get_current_user)):
    if not isinstance(current_user, models.Usuario) or current_user.tipo != 'vistoriador':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado: Requer privilégios de Vistoriador.")
    return current_user

def get_current_admin_user(current_user: models.Usuario = Depends(get_current_user)):
    if not isinstance(current_user, models.Usuario) or current_user.tipo != 'admin':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado: Requer privilégios de Administrador.")
    return current_user

def get_current_active_imobiliaria_group(current_user: models.GrupoImobiliaria = Depends(get_current_user)):
    if not isinstance(current_user, models.GrupoImobiliaria):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado: Requer login de Imobiliária.")
    return current_user

def _exigir_permissao(current_user, permissao: str, descricao: str):
    if isinstance(current_user, models.GrupoImobiliaria) and not current_user.permissoes[permissao]:
        # detail com código: o frontend da imobiliária não desloga neste 403.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "permissao_negada", "message": f"Seu usuário não tem acesso {descricao}."},
        )
    return current_user

def require_acesso_financeiro(current_user: models.GrupoImobiliaria = Depends(get_current_active_imobiliaria_group)):
    """Fechamento mensal e relatórios financeiros."""
    return _exigir_permissao(current_user, "financeiro", "financeiro")

def require_acesso_vistorias(current_user: models.GrupoImobiliaria = Depends(get_current_active_imobiliaria_group)):
    """Agenda, solicitações, laudos, clientes e imóveis."""
    return _exigir_permissao(current_user, "vistorias", "às vistorias")

def get_current_gestor_user(current_user: models.UsuarioTI = Depends(get_current_user)):
    if not isinstance(current_user, models.UsuarioTI) or current_user.nivel_acesso != 'gestor':
         raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado: Requer privilégios de Gestor de TI.")
    return current_user

def get_current_active_user_or_imobiliaria(current_user = Depends(get_current_user)):
    """
    Permite acesso se for um usuário ativo (Vistoriador/Admin) OU um Grupo de Imobiliária.
    Usado para funcionalidades compartilhadas como gerar links de agendamento.
    """
    if isinstance(current_user, models.GrupoImobiliaria):
        return _exigir_permissao(current_user, "vistorias", "às vistorias")
    
    if isinstance(current_user, models.Usuario):
        return current_user
        
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN, 
        detail="Acesso negado: Requer login de Imobiliária ou Usuário do sistema."
    )