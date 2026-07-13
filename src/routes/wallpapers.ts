/**
 * Music wallpaper tiles — self-contained inline SVGs (no external assets),
 * shared by the landing page (music tile) and the music maker page, which
 * offers three background modes. Wave periods divide the tile width so every
 * tile repeats seamlessly.
 */

/** Bright mode (default): sunny sky, clouds, rainbow notes on wavy staves. */
export const MUSIC_BG_BRIGHT =
  `<svg xmlns='http://www.w3.org/2000/svg' width='340' height='300' viewBox='0 0 340 300'>` +
  `<defs><linearGradient id='sky' x1='0' y1='0' x2='0' y2='1'>` +
  `<stop offset='0' stop-color='#dff1fd'/><stop offset='0.7' stop-color='#e9f6fb'/>` +
  `<stop offset='1' stop-color='#fdf6df'/></linearGradient></defs>` +
  `<rect width='340' height='300' fill='url(#sky)'/>` +
  `<g opacity='.55'><circle cx='56' cy='46' r='17' fill='#ffd66e'/>` +
  `<g stroke='#ffd66e' stroke-width='4' stroke-linecap='round'>` +
  `<line x1='56' y1='16' x2='56' y2='24'/><line x1='56' y1='68' x2='56' y2='76'/>` +
  `<line x1='26' y1='46' x2='34' y2='46'/><line x1='78' y1='46' x2='86' y2='46'/>` +
  `<line x1='35' y1='25' x2='41' y2='31'/><line x1='71' y1='61' x2='77' y2='67'/>` +
  `<line x1='77' y1='25' x2='71' y2='31'/><line x1='41' y1='61' x2='35' y2='67'/>` +
  `</g></g>` +
  `<g fill='#ffffff' opacity='.8'>` +
  `<ellipse cx='210' cy='42' rx='30' ry='12'/><ellipse cx='232' cy='36' rx='20' ry='10'/>` +
  `<ellipse cx='190' cy='36' rx='16' ry='9'/>` +
  `<ellipse cx='305' cy='84' rx='24' ry='10'/><ellipse cx='322' cy='79' rx='15' ry='8'/>` +
  `<ellipse cx='105' cy='250' rx='26' ry='10'/><ellipse cx='124' cy='244' rx='16' ry='8'/>` +
  `</g>` +
  `<g stroke='#7fa8c9' stroke-width='1.6' fill='none' opacity='.5'>` +
  `<path d='M0 112 Q 21 104, 42.5 112 T 85 112 T 127.5 112 T 170 112 T 212.5 112 T 255 112 T 297.5 112 T 340 112'/>` +
  `<path d='M0 122 Q 21 114, 42.5 122 T 85 122 T 127.5 122 T 170 122 T 212.5 122 T 255 122 T 297.5 122 T 340 122'/>` +
  `<path d='M0 132 Q 21 124, 42.5 132 T 85 132 T 127.5 132 T 170 132 T 212.5 132 T 255 132 T 297.5 132 T 340 132'/>` +
  `<path d='M0 142 Q 21 134, 42.5 142 T 85 142 T 127.5 142 T 170 142 T 212.5 142 T 255 142 T 297.5 142 T 340 142'/>` +
  `<path d='M0 152 Q 21 144, 42.5 152 T 85 152 T 127.5 152 T 170 152 T 212.5 152 T 255 152 T 297.5 152 T 340 152'/>` +
  `</g>` +
  `<g font-family='Georgia, serif' font-weight='bold' opacity='.75'>` +
  `<text x='24' y='128' font-size='26' fill='#e23b3b' transform='rotate(-10 24 128)'>&#9834;</text>` +
  `<text x='92' y='146' font-size='30' fill='#f39a12' transform='rotate(8 92 146)'>&#9835;</text>` +
  `<text x='168' y='122' font-size='24' fill='#3aa657' transform='rotate(-6 168 122)'>&#9833;</text>` +
  `<text x='232' y='142' font-size='28' fill='#2c6e8f' transform='rotate(10 232 142)'>&#9834;</text>` +
  `<text x='298' y='126' font-size='26' fill='#7a5aa0' transform='rotate(-8 298 126)'>&#9835;</text>` +
  `</g>` +
  `<g stroke='#9fb9d4' stroke-width='1.4' fill='none' opacity='.4'>` +
  `<path d='M0 216 Q 21 224, 42.5 216 T 85 216 T 127.5 216 T 170 216 T 212.5 216 T 255 216 T 297.5 216 T 340 216'/>` +
  `<path d='M0 226 Q 21 234, 42.5 226 T 85 226 T 127.5 226 T 170 226 T 212.5 226 T 255 226 T 297.5 226 T 340 226'/>` +
  `<path d='M0 236 Q 21 244, 42.5 236 T 85 236 T 127.5 236 T 170 236 T 212.5 236 T 255 236 T 297.5 236 T 340 236'/>` +
  `<path d='M0 246 Q 21 254, 42.5 246 T 85 246 T 127.5 246 T 170 246 T 212.5 246 T 255 246 T 297.5 246 T 340 246'/>` +
  `<path d='M0 256 Q 21 264, 42.5 256 T 85 256 T 127.5 256 T 170 256 T 212.5 256 T 255 256 T 297.5 256 T 340 256'/>` +
  `</g>` +
  `<g font-family='Georgia, serif' font-weight='bold' opacity='.7'>` +
  `<text x='56' y='250' font-size='26' fill='#3aa657' transform='rotate(9 56 250)'>&#9835;</text>` +
  `<text x='140' y='232' font-size='24' fill='#e23b3b' transform='rotate(-9 140 232)'>&#9834;</text>` +
  `<text x='206' y='252' font-size='28' fill='#7a5aa0' transform='rotate(7 206 252)'>&#9833;</text>` +
  `<text x='272' y='234' font-size='24' fill='#f39a12' transform='rotate(-7 272 234)'>&#9834;</text>` +
  `</g>` +
  `<g fill='#ffd66e' opacity='.6' font-size='13' font-family='Georgia, serif'>` +
  `<text x='150' y='76'>&#10022;</text><text x='36' y='192'>&#10023;</text>` +
  `<text x='318' y='176'>&#10022;</text><text x='250' y='290'>&#10023;</text>` +
  `</g></svg>`;

/**
 * Dark mode: a drum kit alone on a dark stage under one cool spotlight —
 * light cone from above, lit floor circle, amber wood drums, glinting
 * cymbals, thin stands and mic booms (after the classic stage photo).
 */
export const MUSIC_BG_DARK =
  `<svg xmlns='http://www.w3.org/2000/svg' width='340' height='300' viewBox='0 0 340 300'>` +
  `<defs>` +
  `<linearGradient id='void' x1='0' y1='0' x2='0' y2='1'>` +
  `<stop offset='0' stop-color='#0d0d12'/><stop offset='1' stop-color='#16151c'/>` +
  `</linearGradient>` +
  `<linearGradient id='beam' x1='0' y1='0' x2='0' y2='1'>` +
  `<stop offset='0' stop-color='#cfe4ee' stop-opacity='.22'/>` +
  `<stop offset='1' stop-color='#cfe4ee' stop-opacity='.04'/>` +
  `</linearGradient>` +
  `</defs>` +
  `<rect width='340' height='300' fill='url(#void)'/>` +
  // the spotlight cone
  `<polygon points='158,0 182,0 292,248 48,248' fill='url(#beam)'/>` +
  `<polygon points='163,0 177,0 240,248 100,248' fill='#dcedf5' opacity='.06'/>` +
  // lit stage circle + soft cast shadows
  `<ellipse cx='170' cy='258' rx='148' ry='32' fill='#94929a' opacity='.32'/>` +
  `<ellipse cx='170' cy='254' rx='104' ry='23' fill='#c7c5cb' opacity='.26'/>` +
  `<ellipse cx='118' cy='266' rx='58' ry='11' fill='#0a0a0e' opacity='.5'/>` +
  `<ellipse cx='232' cy='268' rx='52' ry='10' fill='#0a0a0e' opacity='.45'/>` +
  // mic booms (left tall, right short)
  `<g stroke='#7e7c86' stroke-width='2' opacity='.75'>` +
  `<line x1='58' y1='252' x2='58' y2='96'/><line x1='58' y1='96' x2='96' y2='120'/>` +
  `<line x1='48' y1='252' x2='68' y2='252'/>` +
  `<line x1='300' y1='250' x2='300' y2='150'/><line x1='300' y1='150' x2='276' y2='166'/>` +
  `</g>` +
  `<rect x='92' y='114' width='12' height='7' rx='3' fill='#9a98a2' transform='rotate(32 98 117)'/>` +
  `<rect x='272' y='162' width='10' height='6' rx='3' fill='#9a98a2' transform='rotate(-35 277 165)'/>` +
  // cymbal stands (thin hardware)
  `<g stroke='#8a8892' stroke-width='2' opacity='.85'>` +
  `<line x1='126' y1='252' x2='126' y2='148'/>` +
  `<line x1='230' y1='250' x2='230' y2='142'/>` +
  `<line x1='248' y1='252' x2='248' y2='168'/>` +
  `<line x1='118' y1='252' x2='134' y2='252'/><line x1='222' y1='250' x2='238' y2='250'/>` +
  `</g>` +
  // cymbals catching the light
  `<ellipse cx='126' cy='146' rx='30' ry='5.5' fill='#e9cd7c' transform='rotate(-6 126 146)'/>` +
  `<ellipse cx='126' cy='144' rx='30' ry='2.4' fill='#f7ecc0' opacity='.8' transform='rotate(-6 126 144)'/>` +
  `<ellipse cx='230' cy='140' rx='27' ry='5' fill='#e9cd7c' transform='rotate(7 230 140)'/>` +
  `<ellipse cx='230' cy='138' rx='27' ry='2.2' fill='#f7ecc0' opacity='.8' transform='rotate(7 230 138)'/>` +
  `<ellipse cx='248' cy='166' rx='22' ry='4.4' fill='#d9b95e' transform='rotate(-5 248 166)'/>` +
  // floor tom (left, amber wood)
  `<g>` +
  `<rect x='104' y='206' width='46' height='40' rx='5' fill='#a96a24'/>` +
  `<rect x='104' y='206' width='46' height='40' rx='5' fill='#f3e2b6' opacity='.14'/>` +
  `<ellipse cx='127' cy='206' rx='23' ry='7' fill='#ded5c2'/>` +
  `<line x1='112' y1='246' x2='108' y2='258' stroke='#8a8892' stroke-width='2'/>` +
  `<line x1='142' y1='246' x2='146' y2='258' stroke='#8a8892' stroke-width='2'/>` +
  `</g>` +
  // rack tom (small, above the kick)
  `<g><rect x='176' y='176' width='38' height='26' rx='4' fill='#a96a24'/>` +
  `<ellipse cx='195' cy='176' rx='19' ry='5.5' fill='#ded5c2'/></g>` +
  // kick drum: wood hoop, dark head, glinting center
  `<g>` +
  `<circle cx='178' cy='224' r='35' fill='#2a251f'/>` +
  `<circle cx='178' cy='224' r='35' fill='none' stroke='#b97a2e' stroke-width='6'/>` +
  `<circle cx='178' cy='224' r='35' fill='none' stroke='#f3e2b6' stroke-width='1' opacity='.35'/>` +
  `<circle cx='178' cy='224' r='9' fill='#cfc9bd' opacity='.85'/>` +
  `</g>` +
  // snare (left of kick, catching light)
  `<g><rect x='142' y='198' width='34' height='14' rx='3' fill='#c8bfa8'/>` +
  `<ellipse cx='159' cy='198' rx='17' ry='4.5' fill='#e9e2d0'/>` +
  `<line x1='159' y1='212' x2='159' y2='250' stroke='#8a8892' stroke-width='2' opacity='.85'/></g>` +
  `</svg>`;

/**
 * Purple mode: a dreamy lavender sky — crescent moon, dark wispy cloud bands,
 * puffy pink clouds below, and clusters of four-point sparkles. The wispy
 * bands are symmetric ellipses wider than the tile, so left/right edges match
 * and the tile repeats cleanly.
 */
export const MUSIC_BG_PURPLE =
  `<svg xmlns='http://www.w3.org/2000/svg' width='340' height='300' viewBox='0 0 340 300'>` +
  `<defs><linearGradient id='lav' x1='0' y1='0' x2='0' y2='1'>` +
  `<stop offset='0' stop-color='#c7b6ef'/><stop offset='0.55' stop-color='#bdaae9'/>` +
  `<stop offset='1' stop-color='#c9afe6'/></linearGradient></defs>` +
  `<rect width='340' height='300' fill='url(#lav)'/>` +
  // tiny far stars
  `<g fill='#ffffff' opacity='.5'>` +
  `<circle cx='210' cy='30' r='1.1'/><circle cx='268' cy='58' r='1.3'/><circle cx='36' cy='170' r='1'/>` +
  `<circle cx='310' cy='120' r='1.2'/><circle cx='150' cy='96' r='1'/>` +
  `</g>` +
  // dark wispy cloud bands (span past both edges so the tile wraps)
  `<g fill='#9c88d0'>` +
  `<ellipse cx='170' cy='16' rx='230' ry='16' opacity='.5'/>` +
  `<ellipse cx='60' cy='34' rx='120' ry='10' opacity='.35'/>` +
  `<ellipse cx='290' cy='30' rx='110' ry='9' opacity='.35'/>` +
  `<ellipse cx='170' cy='140' rx='240' ry='13' opacity='.4'/>` +
  `<ellipse cx='250' cy='128' rx='120' ry='8' opacity='.3'/>` +
  `</g>` +
  // crescent moon with soft glow (top-left, like the reference)
  `<g><circle cx='95' cy='76' r='42' fill='#ffffff' opacity='.14'/>` +
  `<circle cx='95' cy='76' r='33' fill='#f5f0fc' opacity='.95'/>` +
  `<circle cx='109' cy='68' r='29' fill='#c4b2ec'/>` +
  `</g>` +
  // puffy pink clouds (lower half)
  `<g fill='#f2c8e0' opacity='.85'>` +
  `<ellipse cx='210' cy='240' rx='85' ry='38'/><ellipse cx='150' cy='258' rx='60' ry='28'/>` +
  `<ellipse cx='272' cy='260' rx='58' ry='30'/><ellipse cx='236' cy='210' rx='42' ry='22'/>` +
  `</g>` +
  `<g fill='#f8d8ea' opacity='.8'>` +
  `<ellipse cx='196' cy='222' rx='40' ry='18'/><ellipse cx='252' cy='236' rx='34' ry='16'/>` +
  `<ellipse cx='58' cy='282' rx='52' ry='20'/>` +
  `</g>` +
  // darker wisps hugging the cloud tops
  `<g fill='#a48ad6' opacity='.45'>` +
  `<ellipse cx='170' cy='196' rx='150' ry='9'/><ellipse cx='60' cy='256' rx='80' ry='8'/>` +
  `</g>` +
  // four-point sparkles, clustered like the reference
  `<g fill='#ffffff'>` +
  `<path transform='translate(262 196)' d='M0 -9 L1.8 -1.8 L9 0 L1.8 1.8 L0 9 L-1.8 1.8 L-9 0 L-1.8 -1.8 Z' opacity='.95'/>` +
  `<path transform='translate(286 216) scale(.7)' d='M0 -9 L1.8 -1.8 L9 0 L1.8 1.8 L0 9 L-1.8 1.8 L-9 0 L-1.8 -1.8 Z' opacity='.85'/>` +
  `<path transform='translate(300 178) scale(.5)' d='M0 -9 L1.8 -1.8 L9 0 L1.8 1.8 L0 9 L-1.8 1.8 L-9 0 L-1.8 -1.8 Z' opacity='.8'/>` +
  `<path transform='translate(274 244) scale(.45)' d='M0 -9 L1.8 -1.8 L9 0 L1.8 1.8 L0 9 L-1.8 1.8 L-9 0 L-1.8 -1.8 Z' opacity='.7'/>` +
  `<path transform='translate(160 182) scale(.6)' d='M0 -9 L1.8 -1.8 L9 0 L1.8 1.8 L0 9 L-1.8 1.8 L-9 0 L-1.8 -1.8 Z' opacity='.8'/>` +
  `<path transform='translate(142 200) scale(.4)' d='M0 -9 L1.8 -1.8 L9 0 L1.8 1.8 L0 9 L-1.8 1.8 L-9 0 L-1.8 -1.8 Z' opacity='.7'/>` +
  `<circle cx='250' cy='186' r='1.4' opacity='.9'/><circle cx='294' cy='200' r='1.2' opacity='.8'/>` +
  `<circle cx='172' cy='192' r='1.2' opacity='.8'/><circle cx='310' cy='236' r='1.1' opacity='.7'/>` +
  `</g></svg>`;
