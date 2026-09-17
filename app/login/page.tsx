import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

export default function LoginPage() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center flex flex-col items-center">
          <div className="mb-4 flex items-center justify-center p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
            <img
              src="/images/sigma_ndt_logo.png"
              alt="SIGMA NDT Services Inc."
              className="h-12 w-auto object-contain"
            />
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Coke Drum HAT Platform</h1>
          <p className="mt-1 text-xs text-slate-500">PAUT Historical Analysis &amp; Tracking System</p>
        </div>
        
        <form
          action={async (formData) => {
            "use server";
            try {
              await signIn("credentials", {
                email: formData.get("email"),
                password: formData.get("password"),
                redirectTo: "/dashboard",
              });
            } catch (error) {
              if (error instanceof AuthError) {
                redirect("/login?error=InvalidCredentials");
              }
              throw error;
            }
          }}
          className="space-y-4"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
            <input 
              type="email" 
              name="email"
              placeholder="master@demo.com" 
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500" 
              required 
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
            <input 
              type="password" 
              name="password"
              placeholder="master123"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500" 
              required 
            />
          </div>
          <button 
            type="submit" 
            className="w-full rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 transition-colors"
          >
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
}
