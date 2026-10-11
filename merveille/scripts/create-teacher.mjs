import { createClient } from "@supabase/supabase-js";
const [email, firstName = "Enseignant", lastName = ""] = process.argv.slice(2);
const password = process.env.TEACHER_PASSWORD;
if (
  !email ||
  !password ||
  password.length < 12 ||
  !process.env.SUPABASE_SERVICE_ROLE_KEY ||
  !process.env.NEXT_PUBLIC_SUPABASE_URL
)
  throw new Error(
    "Set TEACHER_PASSWORD (12+ characters), SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL and pass an email.",
  );
const client = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const { data, error } = await client.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { first_name: firstName, last_name: lastName },
});
if (error) throw error;
const { error: roleError } = await client
  .from("users")
  .update({ role: "teacher" })
  .eq("id", data.user.id);
if (roleError) throw roleError;
console.log("Teacher account created.");
