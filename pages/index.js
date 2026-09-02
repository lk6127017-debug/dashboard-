import fs from 'fs';
import path from 'path';
import { useEffect, useState } from 'react';

export async function getStaticProps() {
  const indexPath = path.join(process.cwd(), 'public', 'index.html');
  let html = '';
  try {
    html = fs.readFileSync(indexPath, 'utf8');
  } catch (e) {
    html = '';
  }
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/);
  let body = bodyMatch ? bodyMatch[1] : html;
  body = body.replace(/<script\b[^>]*[\s\S]*?<\/script>/gi, '').trim();
  return { props: { body } };
}

export default function Home({ body }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return;
    const run = () => {
      if (window.__dashboardAppLoaded) return;
      window.__dashboardAppLoaded = true;
      const s = document.createElement('script');
      s.src = '/app.js';
      s.async = true;
      document.body.appendChild(s);
    };
    requestAnimationFrame(run);
    setReady(true);
  }, [ready]);

  return <div id="__dashboard" dangerouslySetInnerHTML={{ __html: body || '' }} />;
}
