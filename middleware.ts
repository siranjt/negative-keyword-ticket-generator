import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip auth for health check, cron routes, and internal API routes
  // Internal APIs (/api/alerts, /api/create-tickets) are called by the
  // dashboard frontend which is already behind Basic Auth on page load
  if (
    pathname === "/api/health" ||
    pathname.startsWith("/api/cron/") ||
    pathname.startsWith("/api/alerts") ||
    pathname.startsWith("/api/create-tickets")
  ) {
    return NextResponse.next();
  }

  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Basic ")) {
    return new NextResponse("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Zoca Dashboard"' },
    });
  }

  const [user, pass] = Buffer.from(auth.split(" ")[1], "base64")
    .toString()
    .split(":");

  const validUser = process.env.DASHBOARD_USER || "zoca";
  const validPass = process.env.DASHBOARD_PASSWORD || "doitfortheplot1234";

  if (user !== validUser || pass !== validPass) {
    return new NextResponse("Invalid credentials", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Zoca Dashboard"' },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
