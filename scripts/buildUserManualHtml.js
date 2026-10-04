const fs = require('fs');
const path = require('path');

const docsDir = path.join(__dirname, '..', 'assets', 'docs');
const htmlPath = path.join(docsDir, 'index.html');
const cssPath = path.join(docsDir, 'styles.css');

let html = fs.readFileSync(htmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');

// Additional mobile-responsive CSS tweaks for in-app viewing
const mobileResponsiveCss = `
@media screen and (max-width: 768px) {
  body {
    padding: 10px 6px !important;
    background-color: #f1f5f9 !important;
  }
  .paper-page {
    width: 100% !important;
    max-width: 100% !important;
    min-height: auto !important;
    margin: 0 0 16px 0 !important;
    padding: 18px 14px !important;
    box-sizing: border-box !important;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08) !important;
  }
  .cover-header {
    margin-bottom: 20px !important;
  }
  .cover-title {
    font-size: 2rem !important;
  }
  .cover-meta-grid {
    grid-template-columns: 1fr !important;
    gap: 10px !important;
  }
  .table-frame {
    overflow-x: auto !important;
    -webkit-overflow-scrolling: touch !important;
    margin-bottom: 12px !important;
  }
  .doc-table, .toc-table {
    min-width: 480px !important;
    width: 100% !important;
  }
  .figure-img {
    max-width: 100% !important;
    height: auto !important;
  }
  .no-print {
    display: none !important;
  }
}
@media print {
  .no-print {
    display: none !important;
  }
}
`;

// Replace link tag with style
html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>' + css + '\n' + mobileResponsiveCss + '</style>');

const images = [
  'anigrow-logo.png',
  'aniweigh-session-setup.png',
  'feed-schedule-setup.png',
  'mobile-wifi-setup.png',
  'web-link-device.png',
  'web-link-hardware-modal.png'
];

for (const img of images) {
  const imgPath = path.join(docsDir, img);
  if (fs.existsSync(imgPath)) {
    const b64 = fs.readFileSync(imgPath).toString('base64');
    const mime = 'image/png';
    const dataUri = `data:${mime};base64,${b64}`;
    html = html.split(img).join(dataUri);
  }
}

const outputPath = path.join(__dirname, '..', 'src', 'constants', 'userManualHtml.ts');
const fileContent = `// Auto-generated self-contained HTML for Ani-Grow User Manual\nexport const USER_MANUAL_HTML = ${JSON.stringify(html)};\n`;

fs.writeFileSync(outputPath, fileContent, 'utf8');
console.log('Successfully generated userManualHtml.ts. Size:', (fileContent.length / 1024).toFixed(2), 'KB');
