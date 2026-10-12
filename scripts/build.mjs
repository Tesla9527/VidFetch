import {mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
await mkdir(new URL('../public/vendor/',import.meta.url),{recursive:true});
await copyFile(new URL('../node_modules/mediabunny/dist/bundles/mediabunny.min.mjs',import.meta.url),new URL('../public/vendor/mediabunny.min.mjs',import.meta.url));
await copyFile(new URL('../node_modules/mediabunny/LICENSE',import.meta.url),new URL('../public/vendor/MEDIABUNNY-LICENSE.txt',import.meta.url));
const dependency=JSON.parse(await readFile(new URL('../node_modules/mediabunny/package.json',import.meta.url),'utf8'));
await writeFile(new URL('../public/vendor/MEDIABUNNY-SOURCE.txt',import.meta.url),'Mediabunny '+dependency.version+'\nUnmodified browser bundle, licensed under MPL-2.0.\nSource: https://www.npmjs.com/package/mediabunny/v/'+dependency.version+'\nRepository: https://github.com/Vanilagy/mediabunny\nLicense: MEDIABUNNY-LICENSE.txt\n');
const source=await readFile(new URL('../src/remux.js',import.meta.url),'utf8');
await writeFile(new URL('../public/remux.js',import.meta.url),source.replace("from 'mediabunny'","from './vendor/mediabunny.min.mjs'"));
console.log('Browser media tools prepared.');
