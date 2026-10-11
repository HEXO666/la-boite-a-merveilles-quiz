import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";

export async function POST(request: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    return NextResponse.json(
      { error: "Student registration is not configured." },
      { status: 503 },
    );
  const body = await request.json().catch(() => null);
  const first =
    typeof body?.first_name === "string"
      ? body.first_name.trim().normalize("NFKC")
      : "";
  const last =
    typeof body?.last_name === "string"
      ? body.last_name.trim().normalize("NFKC")
      : "";
  const password = body?.password;
  if (
    !first ||
    !last ||
    first.length > 60 ||
    last.length > 60 ||
    typeof password !== "string" ||
    password.length < 10 ||
    password.length > 128
  )
    return NextResponse.json(
      { error: "Use valid names and a password of 10–128 characters." },
      { status: 400 },
    );
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
  // A deterministic private auth address lets students log in with names, without collecting email.
  const digest = createHash("sha256")
    .update(`${first.toLocaleLowerCase("fr")}\0${last.toLocaleLowerCase("fr")}`)
    .digest("hex");
  const email = `${digest}@students.invalid`;
  if (body.action === "signup") {
    // On Vercel the trusted platform overwrites this header. Other hosts must set a trusted proxy header.
    const ip =
      request.headers.get("x-vercel-forwarded-for")?.split(",")[0] ||
      request.headers.get("x-real-ip") ||
      "shared";
    const rateKey = createHash("sha256").update(ip).digest("hex");
    const { data: allowed, error: limitError } = await admin.rpc(
      "allow_registration",
      { p_key: rateKey },
    );
    if (limitError || !allowed)
      return NextResponse.json(
        {
          error:
            "Too many registration attempts. Please try again in 15 minutes.",
        },
        { status: 429 },
      );
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        first_name: first,
        last_name: last,
        registration_id: randomUUID(),
      },
    });
    if (error)
      return NextResponse.json(
        {
          error:
            "Registration could not be completed. This name may already be registered.",
        },
        { status: 400 },
      );
  } else if (body.action !== "login")
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error)
    return NextResponse.json(
      { error: "Names or password are incorrect." },
      { status: 401 },
    );
  return NextResponse.json(
    { session: data.session },
    { headers: { "Cache-Control": "no-store" } },
  );
}
