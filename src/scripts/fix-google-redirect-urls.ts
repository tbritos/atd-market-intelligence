/**
 * Fix Google redirect URLs in the websites table.
 * URLs like: https://url/?q=http://www.site.com.br/&opi=...&sa=u&ved=...&usg=...
 * are extracted to just: http://www.site.com.br/
 */

import prisma from '../utils/prisma';

function extractRealUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    // Check if it's a Google redirect (has ?q= param with a URL value)
    const qParam = parsed.searchParams.get('q');
    if (qParam && (qParam.startsWith('http://') || qParam.startsWith('https://'))) {
      return qParam;
    }
  } catch {
    // not a valid URL, skip
  }
  return null;
}

async function main() {
  console.log('Buscando websites com URL de redirecionamento do Google...');

  // Find websites that look like Google redirects (contain ?q= with a URL)
  const websites = await prisma.website.findMany({
    where: {
      OR: [
        { url: { contains: '?q=http://' } },
        { url: { contains: '?q=https://' } },
      ],
    },
    select: { id: true, url: true },
  });

  console.log(`Encontrados: ${websites.length} websites para corrigir`);

  if (websites.length === 0) {
    console.log('Nada a fazer.');
    return;
  }

  let fixed = 0;
  let skipped = 0;

  for (const website of websites) {
    const realUrl = extractRealUrl(website.url);
    if (!realUrl) {
      console.log(`  SKIP (não conseguiu extrair): ${website.url}`);
      skipped++;
      continue;
    }

    // Check if there's already a website with this real URL
    const existing = await prisma.website.findFirst({
      where: { url: realUrl },
      select: { id: true },
    });

    if (existing && existing.id !== website.id) {
      // Duplicate — update stores pointing to this redirect URL to point to existing one
      console.log(`  DUPLICATE: ${website.url} → já existe ${realUrl} (id: ${existing.id})`);

      // Reassign stores
      await prisma.store.updateMany({
        where: { websiteId: website.id },
        data: { websiteId: existing.id },
      });

      // Delete the redirect entry
      await prisma.website.delete({ where: { id: website.id } }).catch(() => {
        // May fail if there are other relations; just update URL instead
      });
    } else {
      // Safe to update the URL
      await prisma.website.update({
        where: { id: website.id },
        data: { url: realUrl },
      });
      console.log(`  OK: ${website.url.substring(0, 60)}... → ${realUrl}`);
    }

    fixed++;
  }

  console.log(`\nConcluído: ${fixed} corrigidos, ${skipped} ignorados`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
