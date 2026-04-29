import logging
from email.message import EmailMessage

import requests

from .config import settings

logger = logging.getLogger(__name__)


def _mailgun_delivery_ready() -> bool:
    return bool(
        settings.MAILGUN_API_KEY
        and settings.MAILGUN_DOMAIN
        and settings.EMAIL_FROM
    )


def _send_email_via_mailgun(message: EmailMessage) -> tuple[bool, str | None]:
    if not _mailgun_delivery_ready():
        return False, "Mailgun delivery is not configured"

    to_email = message["To"]
    subject = message["Subject"]

    plain_body = message.get_body(preferencelist=("plain",))
    text = plain_body.get_content() if plain_body else message.as_string()

    try:
        response = requests.post(
            f"https://api.mailgun.net/v3/{settings.MAILGUN_DOMAIN}/messages",
            auth=("api", settings.MAILGUN_API_KEY),
            data={
                "from": settings.EMAIL_FROM,
                "to": [to_email],
                "subject": subject,
                "text": text,
            },
            timeout=10,  # Mailgun timeout
        )

        if response.status_code == 200:
            return True, None

        logger.error("Mailgun email request failed: %s", response.text)
        return False, f"Mailgun request failed with HTTP {response.status_code}"

    except Exception as exc:
        logger.exception("Mailgun email error while sending to %s", to_email)
        return False, str(exc)
    if not _http_delivery_ready():
        return False, "Outbound email delivery is not configured"

    to_email = message["To"]
    subject = message["Subject"]

    plain_body = message.get_body(preferencelist=("plain",))
    text = plain_body.get_content() if plain_body else message.as_string()

    try:
        response = requests.post(
            settings.EMAIL_HTTP_ENDPOINT,
            auth=(settings.EMAIL_HTTP_AUTH_NAME, settings.EMAIL_HTTP_AUTH_VALUE),
            data={
                "from": settings.EMAIL_FROM,
                "to": [to_email],
                "subject": subject,
                "text": text,
            },
            timeout=settings.EMAIL_HTTP_TIMEOUT_SECONDS,
        )

        if response.status_code in {200, 201, 202}:
            return True, None

        logger.error("Outbound email request failed: %s", response.text)
        return False, f"Outbound email request failed with HTTP {response.status_code}"

    except Exception as exc:
        logger.exception("Outbound email error while sending to %s", to_email)
        return False, str(exc)

def _http_delivery_ready() -> bool:
    return bool(
        settings.EMAIL_HTTP_ENDPOINT
        and settings.EMAIL_HTTP_AUTH_VALUE
        and settings.EMAIL_FROM
    )


def _send_email_via_http_delivery(message: EmailMessage) -> tuple[bool, str | None]:
    if not _http_delivery_ready():
        return False, "Outbound email delivery is not configured"

    to_email = message["To"]
    subject = message["Subject"]

    plain_body = message.get_body(preferencelist=("plain",))
    text = plain_body.get_content() if plain_body else message.as_string()

    try:
        response = requests.post(
            settings.EMAIL_HTTP_ENDPOINT,
            auth=(settings.EMAIL_HTTP_AUTH_NAME, settings.EMAIL_HTTP_AUTH_VALUE),
            data={
                "from": settings.EMAIL_FROM,
                "to": [to_email],
                "subject": subject,
                "text": text,
            },
            timeout=settings.EMAIL_HTTP_TIMEOUT_SECONDS,
        )

        if response.status_code in {200, 201, 202}:
            return True, None

        logger.error("Outbound email request failed: %s", response.text)
        return False, f"Outbound email request failed with HTTP {response.status_code}"

    except Exception as exc:
        logger.exception("Outbound email error while sending to %s", to_email)
        return False, str(exc)

def _send_email(message: EmailMessage) -> tuple[bool, str | None]:
    if _mailgun_delivery_ready():
        return _send_email_via_mailgun(message)
    if _http_delivery_ready():
        return _send_email_via_http_delivery(message)
    return False, "Email delivery is not configured"


def email_delivery_is_configured() -> bool:
    return _mailgun_delivery_ready() or _http_delivery_ready()


def _greeting(name: str | None) -> str:
    if name and name.strip():
        return f"Hi {name.strip()},\n\n"
    return ""


def send_password_reset_email(to_email: str, reset_link: str, recipient_name: str | None = None) -> bool:
    """Send password reset email if outbound delivery is configured.

    Returns True when email is sent, False when delivery is not configured.
    """
    if not email_delivery_is_configured():
        logger.warning(
            "Email delivery not configured. Password reset requested for %s",
            to_email,
        )
        return False

    message = EmailMessage()
    message["Subject"] = "Reset your password"
    message["From"] = settings.EMAIL_FROM
    message["To"] = to_email
    message.set_content(
        f"{_greeting(recipient_name)}"
        "We received a request to reset your password. "
        f"Use this link to set a new password: {reset_link}\n\n"
        f"This link expires in {settings.PASSWORD_RESET_EXPIRE_MINUTES} minutes.\n\n"
        "If you did not request this, you can ignore this email."
    )

    sent, _reason = _send_email(message)
    if sent:
        return True

    logger.warning(
        "Failed to send password reset email to %s",
        to_email,
    )
    return False


def send_login_verification_email(
    to_email: str,
    code: str,
    expires_in_minutes: int,
    recipient_name: str | None = None,
) -> tuple[bool, str | None]:
    if not email_delivery_is_configured():
        logger.warning(
            "Email delivery not configured. Login verification code requested for %s",
            to_email,
        )
        return False, "Email delivery is not configured"

    message = EmailMessage()
    message["Subject"] = "Your login verification code"
    message["From"] = settings.EMAIL_FROM
    message["To"] = to_email
    message.set_content(
        f"{_greeting(recipient_name)}"
        "Use the 6-digit code below to finish logging in to your account.\n\n"
        f"Verification code: {code}\n"
        f"This code expires in {expires_in_minutes} minutes.\n\n"
        "If you did not try to log in, you can ignore this email."
    )

    sent, reason = _send_email(message)
    if sent:
        return True, None

    logger.warning(
        "Failed to send login verification code to %s: %s",
        to_email,
        reason or "unknown reason",
    )
    return False, reason


def send_profile_update_verification_email(
    to_email: str,
    code: str,
    expires_in_minutes: int,
    recipient_name: str | None = None,
) -> bool:
    if not email_delivery_is_configured():
        logger.warning(
            "Email delivery not configured. Profile update verification code requested for %s",
            to_email,
        )
        return False

    message = EmailMessage()
    message["Subject"] = "Confirm your profile update"
    message["From"] = settings.EMAIL_FROM
    message["To"] = to_email
    message.set_content(
        f"{_greeting(recipient_name)}"
        "Use the 6-digit code below to confirm updates to your username/email.\n\n"
        f"Verification code: {code}\n"
        f"This code expires in {expires_in_minutes} minutes.\n\n"
        "If you did not request this change, you can ignore this email."
    )

    sent, _reason = _send_email(message)
    if sent:
        return True

    logger.warning(
        "Failed to send profile update verification code to %s",
        to_email,
    )
    return False


def send_account_deletion_verification_email(
    to_email: str,
    code: str,
    expires_in_minutes: int,
    recipient_name: str | None = None,
) -> bool:
    if not email_delivery_is_configured():
        logger.warning(
            "Email delivery not configured. Account deletion verification code requested for %s",
            to_email,
        )
        return False

    message = EmailMessage()
    message["Subject"] = "Confirm account deletion"
    message["From"] = settings.EMAIL_FROM
    message["To"] = to_email
    message.set_content(
        f"{_greeting(recipient_name)}"
        "Use the 6-digit code below to confirm permanent deletion of your account.\n\n"
        f"Verification code: {code}\n"
        f"This code expires in {expires_in_minutes} minutes.\n\n"
        "If you did not request account deletion, you can ignore this email."
    )

    sent, _reason = _send_email(message)
    if sent:
        return True

    logger.warning(
        "Failed to send account deletion verification code to %s",
        to_email,
    )
    return False
