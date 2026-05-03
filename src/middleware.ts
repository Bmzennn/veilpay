import { type NextRequest, NextResponse } from "next/server";

const MAINTENANCE = process.env.MAINTENANCE_MODE === "true";

export function middleware(req: NextRequest) {
  if (!MAINTENANCE) return NextResponse.next();

  const { pathname } = req.nextUrl;

  // Always pass through: maintenance page, static assets, and all API routes
  // (API routes must remain accessible so ZK provers and payment flows work
  //  even when the UI is in maintenance mode)
  if (
    pathname === "/maintenance.html" ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/apple-icon") ||
    pathname.startsWith("/icon") ||
    pathname.startsWith("/logo") ||
    pathname.startsWith("/tokens/")
  ) {
    return NextResponse.next();
  }

  // Rewrite everything else to the maintenance page
  const url = req.nextUrl.clone();
  url.pathname = "/maintenance.html";
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
