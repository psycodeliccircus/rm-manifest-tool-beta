// build.js
const builder   = require('electron-builder');
const nodeFetch = require('node-fetch');
const fs        = require('fs');
const path      = require('path');
const png2icons = require('png2icons');
const Jimp      = require('jimp');
const { productName, name } = require('./package.json');

class Index {
  async build() {
    await builder.build({
      config: {
        generateUpdatesFilesForAllChannels: false,
        appId: 'com.renildomarcio.rm-manifest-tool',
        productName: productName,
        executableName: name,
        icon: './icons/icon.ico',
        copyright: 'Copyright © 2024-2025 RM Manifest Generator Beta - Dev by Renildo Marcio',
        artifactName: '${name}-${os}-${arch}.${ext}',
        files: [
          "main.js",
          "preload.js",
          "index.html",
          "renderer.js",
          "style.css",
          "splash.html",
          "faqs.html",
          "manifests/**/*",
          "icons/**/*"
        ],
        directories: { output: 'dist' },
        compression: 'maximum',
        asar: true,
        publish: [{
          provider: 'github',
          releaseType: 'release'
        }],
        win: {
          icon: './icons/icon.ico',
          target: [
            { target: 'nsis',     arch: ['x64', 'ia32'] }
          ]
        },
        nsis: {
          artifactName: '${name}-${os}-${arch}.exe',
          installerIcon: './icons/icon.ico',
          uninstallerIcon: './icons/icon.ico',
          oneClick: false,
          allowToChangeInstallationDirectory: true,
          runAfterFinish: true,
          createStartMenuShortcut: true,
          packElevateHelper: true,
          createDesktopShortcut: true,
          shortcutName: productName
        },
        mac: {
          icon: './icons/icon.icns',
          category: 'public.app-category.utilities',
          target: [{ target: 'dmg', arch: ['x64', 'arm64'] }]
        },
        dmg: {
          artifactName: '${name}-${os}-${arch}.dmg',
          title: 'RM Manifest Generator Installer'
        },
        linux: {
          icon: './icons/icon.png',
          target: [
            { target: 'AppImage', arch: ['x64', 'arm64'] },
            { target: 'tar.gz',   arch: ['x64', 'arm64'] }
          ]
        },
        appImage: {
          artifactName: '${name}-${os}-${arch}.AppImage',
          category: 'Utility'
        },
        extraResources: [
          { from: 'icons/icon.png', to: 'icons/icon.png' },
          { from: 'manifests',      to: 'manifests' }
        ],
        // Registra protocolos customizados corretamente como array
        protocols: [
          {
            name: 'RM Manifest Tool Beta Protocol',
            schemes: ['rmmanifesttool', 'rm-manifest-beta']
          }
        ]
      }
    })
    .then(() => console.log('A build está concluída!'))
    .catch(err => console.error('Erro durante a build!', err));
  }

  async iconSet(urlOrFile) {
    console.log(`Obtendo ícone de ${urlOrFile}…`);
    let buffer;
    if (/^https?:\/\//.test(urlOrFile)) {
      const res = await nodeFetch(urlOrFile);
      if (res.status !== 200) {
        return console.error('Erro ao baixar imagem', res.status);
      }
      buffer = await res.buffer();
    } else {
      buffer = fs.readFileSync(urlOrFile);
    }

    // Remove bytes extras após IEND (segurança)
    const IEND = Buffer.from([0,0,0x00,0x00,0x49,0x45,0x4E,0x44]);
    const iendOffset = buffer.indexOf(IEND);
    if (iendOffset !== -1) {
      buffer = buffer.slice(0, iendOffset + 12);
    }

    try {
      const image = await Jimp.read(buffer);
      const resized = await image
        .resize(256, 256)
        .getBufferAsync(Jimp.MIME_PNG);

      const iconDir = path.join(__dirname, 'icons');
      fs.mkdirSync(iconDir, { recursive: true });

      fs.writeFileSync(path.join(iconDir, 'icon.png'), resized);
      fs.writeFileSync(
        path.join(iconDir, 'icon.ico'),
        png2icons.createICO(resized, png2icons.HERMITE, 0, false)
      );
      fs.writeFileSync(
        path.join(iconDir, 'icon.icns'),
        png2icons.createICNS(resized, png2icons.BILINEAR, 0)
      );
      console.log('Ícones gerados em /icons');
    } catch (err) {
      console.error('Erro ao processar imagem:', err);
    }
  }
}

const inst = new Index();
process.argv.slice(2).forEach(arg => {
  if (arg.startsWith('--icon=')) {
    inst.iconSet(arg.split('=')[1]);
  } else if (arg === '--build') {
    inst.build();
  }
});
