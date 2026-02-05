import os
import requests
from dotenv import load_dotenv

load_dotenv()

MAILGUN_API_KEY = os.getenv("MAILGUN_API_KEY")
MAILGUN_DOMAIN = "mg.neectify.com"
MAILGUN_BASE_URL = f"https://api.mailgun.net/v3/{MAILGUN_DOMAIN}"

def send_email(
    to: list[str] | str,
    subject: str,
    html: str,
    sender: str = "Neectify <no-reply@mg.neectify.com>",
    cc: list[str] | None = None,
    bcc: list[str] | None = None,
    attachments: list[tuple[str, bytes, str]] | None = None,
):
    data = {
        "from": sender,
        "to": ", ".join(to) if isinstance(to, list) else to,
        "subject": subject,
        "html": html,
    }

    if cc:
        data["cc"] = ", ".join(cc)

    if bcc:
        data["bcc"] = ", ".join(bcc)

    files = []
    if attachments:
        for filename, content, content_type in attachments:
            files.append(
                ("attachment", (filename, content, content_type))
            )

    response = requests.post(
        f"{MAILGUN_BASE_URL}/messages",
        auth=("api", MAILGUN_API_KEY),
        data=data,
        files=files if files else None
    )

    response.raise_for_status()
    return response.json()