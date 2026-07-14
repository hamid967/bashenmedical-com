"""
CI helper: يضمن وجود مستخدم E2E-admin ثابت في Supabase.

يعتمد على Supabase Auth Admin API + service_role key (server-only).
عملياً:
  1) يبحث عن مستخدم بالبريد $E2E_ADMIN_EMAIL عبر
     GET /auth/v1/admin/users?filter=email.eq.<email>
  2) إن لم يوجد → POST /auth/v1/admin/users  مع:
        { email, password, email_confirm: true }
     (Auto-confirm يتخطى تأكيد البريد.)
  3) إن وُجد → PUT /auth/v1/admin/users/{id}  لتحديث كلمة السر لتطابق
     $E2E_ADMIN_PASSWORD (لضمان قدرة الاختبارات على تسجيل الدخول حتى
     لو دُوّرت كلمة السر في السرّ). يُبقي email_confirm=true.
  4) يمنح دور 'admin' عبر INSERT في public.user_roles باستخدام
     service_role (يتجاوز RLS)، ون تكرار.

المتطلبات (env vars):
  SUPABASE_URL                    - رابط المشروع (مثل https://xxx.supabase.co)
  SUPABASE_SERVICE_ROLE_KEY       - مفتاح service_role (سرّي)
  E2E_ADMIN_EMAIL                 - بريد مستخدم الاختبار
  E2E_ADMIN_PASSWORD              - كلمة السر التي ستستخدمها الاختبارات

Exit codes:
  0 = ok (user + role جاهزان)
  1 = فشل / تكوين ناقص
"""
import json, os, sys, urllib.request, urllib.error
from urllib.parse import quote

REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
            "E2E_ADMIN_EMAIL", "E2E_ADMIN_PASSWORD"]
missing = [k for k in REQUIRED if not os.environ.get(k, "").strip()]
if missing:
    print(f"[fail] متغيّرات مفقودة: {', '.join(missing)}", file=sys.stderr)
    sys.exit(1)

SUPA_URL = os.environ["SUPABASE_URL"].rstrip("/")
SRV_KEY  = os.environ["SUPABASE_SERVICE_ROLE_KEY"].strip()
EMAIL    = os.environ["E2E_ADMIN_EMAIL"].strip()
PASSWORD = os.environ["E2E_ADMIN_PASSWORD"]

ADMIN_HEADERS = {
    "apikey": SRV_KEY,
    "Authorization": f"Bearer {SRV_KEY}",
    "Content-Type": "application/json",
}


def http(method: str, path: str, body: dict | None = None,
         headers: dict | None = None) -> tuple[int, dict | list | str]:
    url = f"{SUPA_URL}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={**ADMIN_HEADERS, **(headers or {})})
    try:
        with urllib.request.urlopen(req) as res:
            raw = res.read().decode()
            return res.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="ignore")
        try:
            parsed = json.loads(raw)
        except Exception:
            parsed = raw
        return e.code, parsed


def find_user_id(email: str) -> str | None:
    # /auth/v1/admin/users يدعم ?filter=email.eq.<email> — إن لم يدعم البارامتر
    # نلجأ لتصفح الصفحات.
    code, body = http("GET", f"/auth/v1/admin/users?filter=email.eq.{quote(email)}")
    if code == 200 and isinstance(body, dict):
        users = body.get("users", [])
        for u in users:
            if (u.get("email") or "").lower() == email.lower():
                return u["id"]
    # fallback: أول 200 مستخدم
    code, body = http("GET", "/auth/v1/admin/users?per_page=200")
    if code == 200 and isinstance(body, dict):
        for u in body.get("users", []):
            if (u.get("email") or "").lower() == email.lower():
                return u["id"]
    return None


def create_user() -> str:
    code, body = http("POST", "/auth/v1/admin/users", {
        "email": EMAIL,
        "password": PASSWORD,
        "email_confirm": True,
        "user_metadata": {"purpose": "e2e-admin"},
    })
    if code in (200, 201) and isinstance(body, dict) and body.get("id"):
        print(f"[ok] أُنشئ مستخدم E2E-admin: {EMAIL} (id={body['id']})")
        return body["id"]
    # لو ظهر خطأ "already exists" نتعامل معه في المتصل.
    if code in (409, 422):
        raise FileExistsError(json.dumps(body, ensure_ascii=False))
    raise RuntimeError(f"فشل إنشاء المستخدم [HTTP {code}] {body!r}")


def update_password_and_confirm(user_id: str) -> None:
    code, body = http("PUT", f"/auth/v1/admin/users/{user_id}", {
        "password": PASSWORD,
        "email_confirm": True,
    })
    if code != 200:
        raise RuntimeError(
            f"فشل تحديث كلمة السر للمستخدم {user_id} [HTTP {code}] {body!r}"
        )
    print(f"[ok] كلمة السر مُحدَّثة و email_confirm=true للمستخدم {user_id}")


def grant_admin_role(user_id: str) -> None:
    # نستعمل PostgREST بمفتاح service_role → يتجاوز RLS.
    # ON CONFLICT DO NOTHING عبر Prefer: resolution=ignore-duplicates.
    code, body = http(
        "POST",
        "/rest/v1/user_roles",
        {"user_id": user_id, "role": "admin"},
        headers={"Prefer": "resolution=ignore-duplicates,return=minimal"},
    )
    if code in (200, 201, 204):
        print(f"[ok] دور admin مضمون في user_roles للمستخدم {user_id}")
        return
    # لو الاستعلام مرّ لكن الصف موجود مسبقًا PostgREST يعيد 201 غالبًا.
    raise RuntimeError(
        f"فشل منح دور admin للمستخدم {user_id} [HTTP {code}] {body!r}"
    )


def main() -> int:
    uid = find_user_id(EMAIL)
    if uid is None:
        try:
            uid = create_user()
        except FileExistsError:
            # سباق: تم إنشاؤه بين GET و POST — أعِد البحث.
            uid = find_user_id(EMAIL)
            if uid is None:
                print("[fail] الخادم قال 'already exists' ولم يعُد المستخدم مرئيًا.",
                      file=sys.stderr)
                return 1
            print(f"[ok] المستخدم موجود مسبقًا: {EMAIL} (id={uid})")
            update_password_and_confirm(uid)
    else:
        print(f"[ok] المستخدم موجود: {EMAIL} (id={uid})")
        update_password_and_confirm(uid)

    grant_admin_role(uid)
    print("[done] مستخدم E2E-admin جاهز للاختبارات.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(f"[fail] {e}", file=sys.stderr)
        sys.exit(1)
