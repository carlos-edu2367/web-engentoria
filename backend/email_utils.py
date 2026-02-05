import os
import requests
from dotenv import load_dotenv

load_dotenv()

MAILGUN_API_KEY = os.getenv("MAILGUN_API_KEY")
MAILGUN_DOMAIN = "mg.neectify.com"
MAILGUN_BASE_URL = f"https://api.mailgun.net/v3/{MAILGUN_DOMAIN}"

def send_email(
    to: str,
    subject: str,
    html: str,
    sender: str = "Neectify <no-reply@mg.neectify.com>",
    cc: list[str] | None = None,
    bcc: list[str] | None = None,
):
    data = {
        "from": sender,
        "to": to,
        "subject": subject,
        "html": html
    }

    if cc:
        data["cc"] = ", ".join(cc)

    if bcc:
        data["bcc"] = ", ".join(bcc)

    response = requests.post(
        f"{MAILGUN_BASE_URL}/messages",
        auth=("api", MAILGUN_API_KEY),
        data=data
    )

    response.raise_for_status()
    return response.json()