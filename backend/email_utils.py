import os
import requests
from dotenv import load_dotenv

load_dotenv()

MAILGUN_API_KEY = os.getenv("MAILGUN_API_KEY")
MAILGUN_DOMAIN = "mg.neectify.com"
MAILGUN_BASE_URL = f"https://api.mailgun.net/v3/{MAILGUN_DOMAIN}"

def inject_neectify_footer(html: str) -> str:
    footer_html = """
    <div style="margin-top:32px; padding-top:16px; border-top:1px solid #e5e7eb; text-align:center;">
        <p style="margin:0; font-size:11px; color:#9ca3af; font-family: Arial, Helvetica, sans-serif;">
            Este sistema foi desenvolvido pela
            <a href="https://neectify.com"
               target="_blank"
               style="color:#6b7280; text-decoration:none; font-weight:bold;">
                Neectify
            </a>.
            Gostou? Solicite um orçamento!
        </p>
    </div>
    """

    # Se tiver </body>, injeta antes
    if "</body>" in html.lower():
        return html.replace(
            "</body>",
            f"{footer_html}\n</body>"
        )

    # Fallback: adiciona no final
    return html + footer_html


def send_email(
    to: list[str] | str,
    subject: str,
    html: str,
    sender: str = "Neectify <no-reply@mg.neectify.com>",
    cc: list[str] | None = None,
    bcc: list[str] | None = None,
    attachments: list[tuple[str, bytes, str]] | None = None,
    include_footer: bool = True
):
    html_full = inject_neectify_footer(html) if include_footer else html
    data = {
        "from": sender,
        "to": ", ".join(to) if isinstance(to, list) else to,
        "subject": subject,
        "html": html_full,
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