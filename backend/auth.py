# backend/auth.py

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from passlib.exc import UnknownHashError
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
    """Envia o e-mail de redefinição de senha."""
    reset_link = f"{settings.FRONTEND_URL}/redefinir-senha.html?token={token}"
    
    # Se a chave da API não estiver configurada, imprime o link no console para desenvolvimento
    if not settings.SENDGRID_API_KEY:
        print("--- MODO DE DESENVOLVIMENTO ---")
        print(f"Link para redefinição de senha para {email_to}:")
        print(reset_link)
        print("-------------------------------")
        return

    message = Mail(
        from_email=settings.EMAIL_FROM,
        to_emails=email_to,
        subject='Recuperação de Senha',
        html_content=f"""
            <p>Olá,</p>
            <p>Você solicitou a redefinição da sua senha. Clique no link abaixo para criar uma nova senha:</p>
            <p><a href="{reset_link}">Redefinir Minha Senha</a></p>
            <p>Este link irá expirar em 15 minutos.</p>
            <p>Se você não solicitou esta alteração, por favor, ignore este e-mail.</p>
        """
    )
    try:
        sg = sendgrid.SendGridAPIClient(settings.SENDGRID_API_KEY)
        response = sg.send(message)
        print(f"E-mail de recuperação enviado para {email_to}, Status: {response.status_code}")
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

def get_current_gestor_user(current_user: models.UsuarioTI = Depends(get_current_user)):
    if not isinstance(current_user, models.UsuarioTI) or current_user.nivel_acesso != 'gestor':
         raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado: Requer privilégios de Gestor de TI.")
    return current_user

