const playwright = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await playwright.firefox.launch({ headless: false, slowMo: 200 });
  const page = await browser.newPage();
  await page.goto('https://www.kitech.it/Aliquote-contributive-INPS.aspx');
  await page.waitForSelector('#ContentPlaceHolder1_CPHDati_DivLinks > div');

  const sezioni = await page.$$eval('#ContentPlaceHolder1_CPHDati_DivLinks > div[id*="DivMain_"]', divs => {
    return divs.map(div => {
      const id = div.id;
      const numeroId = id.match(/\d+$/)[0];
      const nomeSezione = div.querySelector('a > table > tbody > tr > td:nth-child(2)')?.innerText.trim() || '';
      return { id, numeroId, nomeSezione };
    });
  });

  const risultatoFinale = [];

  for (const sezione of sezioni) {
    console.log(`Apro sezione: ${sezione.nomeSezione}`);
    await page.click(`#ContentPlaceHolder1_CPHDati_LB_${sezione.numeroId}`);

    try {
      await page.waitForSelector(`#ContentPlaceHolder1_CPHDati_Div_${sezione.numeroId}`, { state: 'visible', timeout: 7000 });
      await page.waitForTimeout(500);
    } catch (e) {
      console.log(`Attenzione: sottosezioni di ${sezione.nomeSezione} non visibili o vuote`);
    }

    const sottosezioni = await page.$$eval(`#ContentPlaceHolder1_CPHDati_Div_${sezione.numeroId} li`, lis => {
      return lis.map(li => {
        const link = li.querySelector('a');
        const href = link ? link.href : null;
        const testo = link ? link.innerText.trim() : li.innerText.trim();
        return { testo, href };
      });
    });

    for (const sottosezione of sottosezioni) {
      if (!sottosezione.href) continue;

      console.log(`Visito: ${sottosezione.testo}`);

      const newPage = await browser.newPage();
      await newPage.goto(sottosezione.href, { waitUntil: 'domcontentloaded' });

      try {
        await newPage.waitForSelector('#ContentPlaceHolder1_CPHDati_Tabella table', { timeout: 7000 });
        // Estrazione dati tabellari come array di array
        const tabellaDati = await newPage.$$eval('#ContentPlaceHolder1_CPHDati_Tabella table tr', rows => {
          return Array.from(rows, row => {
            const cells = row.querySelectorAll('td, th');
            return Array.from(cells, cell => cell.innerText.trim());
          });
        });
        sottosezione.tabellaDati = tabellaDati;
      } catch (e) {
        console.log(`⚠️ Nessuna tabella trovata per: ${sottosezione.href}`);
        sottosezione.tabellaDati = null;
      }

      await newPage.close();
    }

    risultatoFinale.push({
      nomeSezione: sezione.nomeSezione,
      numeroId: sezione.numeroId,
      sottosezioni,
    });

    await page.waitForTimeout(500);
  }

  fs.writeFileSync('aliquote_inps_completo.json', JSON.stringify(risultatoFinale, null, 2));
  console.log('✅ Dati completi salvati in aliquote_inps_completo.json');

  await browser.close();
})();
