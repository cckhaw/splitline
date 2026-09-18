// Belt-and-suspenders alongside the admin module's own separate
// auth — keeps /admin out of search engines too. Next.js serves this at
// /robots.txt automatically. No sitemap.xml exists in this app, so this
// doesn't reference one.
export default function robots() {
  return {
    rules: {
      userAgent: "*",
      disallow: ["/admin"],
    },
  };
}
