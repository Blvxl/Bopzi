// Original vector scenes and six-part classic block-avatar illustrations.
// No scraped game assets, AI imagery, logos, or third-party character designs.
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('public/demos');
const poly = (p, fill, extra = '') => `<polygon points="${p}" fill="${fill}" ${extra}/>`;
const block = (x,y,w,h,d,top,front,side) => `<g>${poly(`${x},${y} ${x+w},${y} ${x+w+d},${y-d*.5} ${x+d},${y-d*.5}`,top)}${poly(`${x+w},${y} ${x+w+d},${y-d*.5} ${x+w+d},${y+h-d*.5} ${x+w},${y+h}`,side)}<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${front}"/></g>`;
const defs = `<defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#268ad9"/><stop offset=".65" stop-color="#b5e8ff"/><stop offset="1" stop-color="#f4e8cd"/></linearGradient><linearGradient id="water" x2="0" y2="1"><stop stop-color="#25b8d5"/><stop offset="1" stop-color="#0a4d8d"/></linearGradient><linearGradient id="night" x2="0" y2="1"><stop stop-color="#081724"/><stop offset="1" stop-color="#182d39"/></linearGradient><radialGradient id="sun"><stop stop-color="#fff9dc" stop-opacity=".8"/><stop offset="1" stop-color="#fff9dc" stop-opacity="0"/></radialGradient><filter id="blur"><feGaussianBlur stdDeviation="22"/></filter><filter id="shadow"><feDropShadow dx="0" dy="18" stdDeviation="15" flood-opacity=".25"/></filter><linearGradient id="skin" x2="1" y2="0"><stop stop-color="#f6c735"/><stop offset=".42" stop-color="#ffe56a"/><stop offset="1" stop-color="#dc9b22"/></linearGradient></defs>`;
function cloud(x,y,k) { return `<g transform="translate(${x} ${y}) scale(${k})" fill="#fff" opacity=".83"><ellipse cx="0" cy="0" rx="120" ry="22"/><circle cx="-52" cy="-20" r="36"/><circle cx="6" cy="-38" r="54"/><circle cx="66" cy="-14" r="33"/></g>`; }
function platform(x,y,k,color='#de51bc') { return `<g transform="translate(${x} ${y}) scale(${k})" filter="url(#shadow)">${block(0,0,250,55,80,color,color === '#de51bc' ? '#963b98' : '#279cbc','#205679')}<path d="M12 12h228" stroke="white" stroke-opacity=".35" stroke-width="4"/></g>`; }
function scene(id) {
  let a = `<rect width="1920" height="1080" fill="url(#sky)"/><circle cx="1500" cy="160" r="480" fill="url(#sun)"/>${cloud(330,180,1.3)}${cloud(1200,100,.9)}${cloud(1650,380,.65)}`;
  if(id==='obby') {
    a += `<path d="M0 930 Q470 760 1000 910 T1920 850V1080H0Z" fill="#e6f8ff" opacity=".8"/><path d="M0 1000 Q570 880 1000 990 T1920 940V1080H0Z" fill="#fff" opacity=".6"/>`;
    for(let i=0;i<7;i++) a += block(1180+i*35,520-i*36,120,400+i*30,50,['#843deb','#504bdf','#23b5d2'][i%3],'#504aad','#333477');
    a += platform(1340,370,.34,'#5dddf2')+platform(1100,475,.48)+platform(815,620,.68,'#5dddf2')+platform(1030,770,.88)+platform(780,930,1.15,'#5dddf2');
    a += `<g fill="none" stroke="#d5fcff" stroke-width="12"><ellipse cx="1380" cy="270" rx="75" ry="100"/><ellipse cx="1380" cy="270" rx="88" ry="115" opacity=".3"/></g>`;
  } else if(id==='simulator') {
    a += `<rect y="670" width="1920" height="410" fill="url(#water)"/>`;
    for(let i=0;i<18;i++) a+=`<path d="M${i*120} ${740+(i%4)*75}h${80+i%3*40}" stroke="#93ebff" opacity=".25" stroke-width="3"/>`;
    for(const [x,y,k] of [[1300,710,.6],[750,845,1.2],[260,800,.8]]) a += `<g transform="translate(${x} ${y}) scale(${k})">${block(0,0,440,200,145,'#73df66','#347458','#1d4c48')}${block(55,-35,240,35,100,'#a8f184','#66c868','#348467')}</g>`;
    for(const [x,y,k] of [[1300,570,.65],[1640,570,.7],[820,690,1.1]]) a += `<g transform="translate(${x} ${y}) scale(${k})">${block(0,0,40,180,18,'#a0ec87','#614e35','#443c32')}${block(-100,-70,200,70,70,'#a2ef80','#42b65b','#24764b')}${block(-65,-125,130,65,60,'#bef592','#60ce6d','#349650')}</g>`;
    for(const [x,y,k] of [[1010,860,1],[1250,740,.75],[1440,660,.6]]) a += `<g transform="translate(${x} ${y}) scale(${k})" filter="url(#shadow)">${block(0,0,105,65,28,'#ffe28a','#eab941','#95682b')}<path d="M0 12h105M50 0v65" stroke="#fff0ae" stroke-width="7"/><rect x="43" y="28" width="18" height="23" rx="3" fill="#79542a"/></g>`;
    for(let i=0;i<10;i++) a += `<ellipse cx="${860+i*29}" cy="${920-(i%3)*13}" rx="22" ry="12" fill="#ffdd57" stroke="#c59225" stroke-width="5"/>`;
  } else {
    a = `<rect width="1920" height="1080" fill="url(#night)"/><path d="M0 0L760 300V800L0 1080Z" fill="#17252c"/><path d="M1920 0L1160 300V800L1920 1080Z" fill="#101b25"/><path d="M0 1080L760 800H1160L1920 1080Z" fill="#23343b"/><rect x="760" y="300" width="400" height="500" fill="#050b13"/>`;
    for(let i=0;i<6;i++){let k=i/6;let x=160+k*570,y=90+k*200,w=200*(1-k);a+=`<path d="M${x} ${y}v${850*(1-k)}h${w}V${y-25}" fill="none" stroke="#3c555e" stroke-width="14"/>`;}
    for(let i=0;i<6;i++) a+=`<path d="M${i*384} 1080L${760+i*80} 800" stroke="#43616b" opacity=".35" stroke-width="3"/>`;
    a+=`<path d="M0 965L1920 965M355 890H1600M610 840H1330" stroke="#547580" opacity=".3" stroke-width="3"/><rect x="840" y="278" width="240" height="18" fill="#75def6"/><ellipse cx="960" cy="370" rx="250" ry="140" fill="#5bc2ff" opacity=".15" filter="url(#blur)"/><path d="M940 785L1450 940L1240 680Z" fill="#b9f0ff" opacity=".07"/><circle cx="925" cy="540" r="9" fill="#f44857"/><circle cx="983" cy="540" r="9" fill="#f44857"/><path d="M905 635L915 560Q955 535 995 560L1018 650Z" fill="#000"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">${defs}${a}</svg>`;
}
function avatar(id) {
  const horror=id==='horror', obby=id==='obby';
  const arm = (x,y,angle) => `<g transform="translate(${x} ${y}) rotate(${angle})">${block(0,0,100,260,30,'#ffeb87',horror?'#dfdbbc':'#f2cb3c',horror?'#969984':'#c18a21')}</g>`;
  let a = arm(135,310,obby?38:18)+arm(520,290,obby?-125:-70);
  a += `<g transform="translate(258 552) rotate(${obby?18:7})">${block(0,0,115,270,35,horror?'#536a7b':'#88bc58',horror?'#243a4d':'#75a845',horror?'#132734':'#4b6f32')}</g>`;
  a += `<g transform="translate(390 550) rotate(${obby?-32:-9})">${block(0,0,115,270,35,horror?'#536a7b':'#88bc58',horror?'#243a4d':'#75a845',horror?'#132734':'#4b6f32')}</g>`;
  a += block(245,290,260,270,40,horror?'#b44647':'#50b7ff',horror?'#792d39':'#187dd1',horror?'#461e2e':'#105294');
  // Classic cylindrical head, with a simple printed face rather than a sculpted toy face.
  a += `<g transform="translate(287 87)"><path d="M0 30Q90 -10 180 30V177Q90 217 0 177Z" fill="${horror?'#ded9b7':'url(#skin)'}"/><ellipse cx="90" cy="30" rx="90" ry="30" fill="${horror?'#f1edce':'#fff09c'}"/><ellipse cx="48" cy="102" rx="9" ry="14" fill="#24282c"/><ellipse cx="125" cy="102" rx="9" ry="14" fill="#24282c"/><path d="${horror?'M61 158Q88 137 115 158':'M50 145Q87 180 125 145'}" fill="none" stroke="#24282c" stroke-width="7" stroke-linecap="round"/></g>`;
  if(horror) a+=`<g transform="translate(610 402) rotate(-22)"><rect x="0" y="0" width="130" height="65" rx="7" fill="#34475a"/><ellipse cx="130" cy="32" rx="15" ry="32" fill="#d9fbff"/><path d="M145 0L790 -210V280L145 65Z" fill="#c1f1ff" opacity=".08"/></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="850" height="900" viewBox="40 20 760 850">${defs}${a}</svg>`;
}
for(const id of ['simulator','obby','horror']) {
  const dir = path.join(root,id); await mkdir(dir,{recursive:true});
  await sharp(Buffer.from(scene(id))).jpeg({quality:95}).toFile(path.join(dir,'background.jpg'));
  await sharp(Buffer.from(avatar(id))).trim().png().toFile(path.join(dir,'character.png'));
}
console.log('Rendered three original classic block-avatar demos.');
