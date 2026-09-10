import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Source preview opt-out",
  description: "How publishers can control Coeus static source previews.",
  robots: { index: true, follow: true },
};

export default function SourcePreviewOptOutPage() {
  return (
    <article className="legal-page">
      <p className="eyebrow">Publisher controls</p>
      <h1>Control Coeus source previews</h1>
      <p>Coeus may show a small, non-interactive screenshot solely as a link preview when a page cannot be embedded. It always links to the original page.</p>
      <h2>Fastest automated opt-out</h2>
      <p>Disallow the <code>CoeusPreview</code> crawler in your site’s <code>robots.txt</code>. Coeus checks this before it fetches or renders a preview.</p>
      <pre>{"User-agent: CoeusPreview\nDisallow: /"}</pre>
      <p>We also honor page-level <code>noimageindex</code>, <code>nosnippet</code>, <code>noindex</code>, <code>noarchive</code>, and <code>no-preview</code> directives in <code>X-Robots-Tag</code> or a robots meta tag.</p>
      <h2>Request removal</h2>
      <p>To block a domain or remove an existing cached preview without changing your site, email <a href="mailto:preview-opt-out@coeuscoeus.com?subject=Source%20preview%20opt-out">preview-opt-out@coeuscoeus.com</a> from an address at that domain. Include the domain and, if applicable, the page URL. No Coeus account is required.</p>
      <p>We verify domain control, apply the block, and remove matching cached previews. The static preview never includes a signed-in, personalized, paywalled, or access-controlled page.</p>
    </article>
  );
}
