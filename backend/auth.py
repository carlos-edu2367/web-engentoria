# backend/auth.py

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from passlib.exc import UnknownHashError  # Importar a exceção específica
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import secrets
import sendgrid
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
        # Se o hash armazenado não for reconhecido, a senha é inválida.
        return False

def get_password_hash(password):
    """Gera o hash de uma senha."""
    return pwd_context.hash(password[:72])

# --- Utilitários de Token JWT ---

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    """Cria um novo token de acesso JWT."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        # Padrão de 15 minutos se não for especificado
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

# --- Recuperação de Usuário ---

def get_user(db: Session, email: str):
    """Busca um usuário em todas as tabelas relevantes pelo e-mail."""
    user = db.query(models.Usuario).filter(models.Usuario.email == email, models.Usuario.is_deleted == False).first()
    if user:
        return user
    user = db.query(models.GrupoImobiliaria).filter(models.GrupoImobiliaria.email == email, models.GrupoImobiliaria.is_deleted == False).first()
    if user:
        return user
    user = db.query(models.UsuarioTI).filter(models.UsuarioTI.email == email).first()
    return user

# --- Dependências de Autenticação ---

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Decodifica o token JWT e retorna o usuário correspondente."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Não foi possível validar as credenciais",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
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
    return user

# Dependências para tipos de usuário específicos
def get_current_active_vistoriador(current_user: models.Usuario = Depends(get_current_user)):
    if not isinstance(current_user, models.Usuario) or current_user.is_deleted:
        raise HTTPException(status_code=403, detail="Acesso negado: Requer perfil de vistoriador ativo.")
    return current_user

def get_current_admin_user(current_user: models.Usuario = Depends(get_current_user)):
    if not (isinstance(current_user, models.Usuario) and current_user.tipo == 'admin' and not current_user.is_deleted):
        raise HTTPException(status_code=403, detail="Acesso negado: Requer perfil de administrador.")
    return current_user

def get_current_active_imobiliaria_group(current_user: models.GrupoImobiliaria = Depends(get_current_user)):
    if not isinstance(current_user, models.GrupoImobiliaria) or current_user.is_deleted:
        raise HTTPException(status_code=403, detail="Acesso negado: Requer perfil de imobiliária.")
    return current_user

def get_current_gestor_user(current_user: models.UsuarioTI = Depends(get_current_user)):
    if not (isinstance(current_user, models.UsuarioTI) and current_user.nivel_acesso == 'gestor'):
        raise HTTPException(status_code=403, detail="Acesso negado: Requer perfil de gestor de TI.")
    return current_user

# =================================================================
# --- NOVA FUNCIONALIDADE: Recuperação de Senha ---
# =================================================================

def generate_reset_token() -> str:
    """Gera um token seguro e aleatório para a redefinição de senha."""
    return secrets.token_urlsafe(32)

def send_password_reset_email(email_to: str, token: str):
    """Envia o e-mail de redefinição de senha usando SendGrid."""
    if not settings.SENDGRID_API_KEY or settings.SENDGRID_API_KEY == "YOUR_SENDGRID_API_KEY":
        print("--- MODO DE DESENVOLVIMENTO ---")
        print("Chave da API SendGrid não configurada. Exibindo link no console.")
        print(f"Link de redefinição para {email_to}: {settings.PASSWORD_RECOVERY_URL}?token={token}")
        print("---------------------------------")
        return

    message = Mail(
        from_email=settings.EMAIL_FROM,
        to_emails=email_to,
        subject='Recuperação de Senha - Plataforma de Vistorias',
        html_content=f"""
        <html>
        <body>
            <p>Olá,</p>
            <p>Você solicitou a redefinição da sua senha. Por favor, clique no link abaixo para criar uma nova senha:</p>
            <p><a href="{settings.PASSWORD_RECOVERY_URL}?token={token}" style="background-color: #007bff; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px;">Redefinir Minha Senha</a></p>
            <p>Este link é válido por 15 minutos.</p>
            <p>Se você não solicitou esta redefinição, por favor, ignore este e-mail.</p>
            <p>Atenciosamente,<br>Equipe de Suporte</p>
        </body>
        </html>
        """
    )
    try:
        sg = sendgrid.SendGridAPIClient(settings.SENDGRID_API_KEY)
        response = sg.send(message)
        print(f"Email de recuperação enviado para {email_to}. Status: {response.status_code}")
    except Exception as e:
        print(f"ERRO ao enviar e-mail de recuperação para {email_to}: {e}")

def get_password_reset_token(db: Session, token: str) -> models.PasswordResetToken | None:
    """Busca um token de redefinição de senha no banco de dados."""
    return db.query(models.PasswordResetToken).filter(models.PasswordResetToken.token == token).first()

