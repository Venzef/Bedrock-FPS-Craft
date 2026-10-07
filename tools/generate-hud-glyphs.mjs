import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { deflateSync } from "node:zlib";

const WIDTH=256,HEIGHT=256;
const pixels=Buffer.alloc(WIDTH*HEIGHT*4);

function setPixel(x,y,[r,g,b,a]){
  if(x<0||y<0||x>=WIDTH||y>=HEIGHT)return;
  const at=(y*WIDTH+x)*4;
  pixels[at]=r;pixels[at+1]=g;pixels[at+2]=b;pixels[at+3]=a;
}

function rect(x,y,width,height,color){
  for(let py=y;py<y+height;py++)for(let px=x;px<x+width;px++)setPixel(px,py,color);
}

function drawGlyph(index,frame,kind){
  const ox=index%16*16,oy=Math.floor(index/16)*16;
  const accent=kind==="plant"?[255,133,35,255]:[42,220,226,255];
  const dim=kind==="plant"?[151,65,18,255]:[15,105,122,255];
  const border=[238,238,238,255],track=[38,42,48,230];

  if(kind==="plant"){
    rect(ox+2,oy+3,4,4,accent);setPixel(ox+3,oy+2,accent);setPixel(ox+5,oy+2,border);setPixel(ox+6,oy+1,accent);
  }else{
    rect(ox+2,oy+2,2,6,accent);rect(ox+1,oy+3,5,2,accent);setPixel(ox+5,oy+6,border);setPixel(ox+6,oy+7,accent);
  }

  rect(ox+1,oy+9,14,6,border);
  rect(ox+2,oy+10,12,4,track);
  const halfUnits=Math.round(frame*24/20);
  const fullPixels=Math.floor(halfUnits/2);
  if(fullPixels>0)rect(ox+2,oy+10,fullPixels,4,accent);
  if(halfUnits%2===1&&fullPixels<12)rect(ox+2+fullPixels,oy+10,1,4,[dim[0],dim[1],dim[2],210]);
}

for(let frame=0;frame<=20;frame++){
  drawGlyph(0x00+frame,frame,"plant");
  drawGlyph(0x20+frame,frame,"defuse");
}

function crc32(data){
  let crc=0xffffffff;
  for(const byte of data){
    crc^=byte;
    for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}

function chunk(type,data){
  const name=Buffer.from(type,"ascii"),result=Buffer.alloc(12+data.length);
  result.writeUInt32BE(data.length,0);name.copy(result,4);data.copy(result,8);
  result.writeUInt32BE(crc32(Buffer.concat([name,data])),8+data.length);
  return result;
}

const ihdr=Buffer.alloc(13);
ihdr.writeUInt32BE(WIDTH,0);ihdr.writeUInt32BE(HEIGHT,4);
ihdr[8]=8;ihdr[9]=6;ihdr[10]=0;ihdr[11]=0;ihdr[12]=0;
const scanlines=Buffer.alloc((WIDTH*4+1)*HEIGHT);
for(let y=0;y<HEIGHT;y++)pixels.copy(scanlines,y*(WIDTH*4+1)+1,y*WIDTH*4,(y+1)*WIDTH*4);
const png=Buffer.concat([
  Buffer.from([137,80,78,71,13,10,26,10]),
  chunk("IHDR",ihdr),chunk("IDAT",deflateSync(scanlines,{level:9})),chunk("IEND",Buffer.alloc(0)),
]);

const output=resolve(import.meta.dirname,"../resource_pack/font/glyph_E2.png");
await mkdir(dirname(output),{recursive:true});
await writeFile(output,png);
console.log(output);
