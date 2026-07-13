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

/** Dark mode: a moody stage with drums, cymbals and drumsticks. */
export const MUSIC_BG_DARK =
  `<svg xmlns='http://www.w3.org/2000/svg' width='340' height='300' viewBox='0 0 340 300'>` +
  `<defs><linearGradient id='night' x1='0' y1='0' x2='0' y2='1'>` +
  `<stop offset='0' stop-color='#171226'/><stop offset='1' stop-color='#241b3a'/>` +
  `</linearGradient></defs>` +
  `<rect width='340' height='300' fill='url(#night)'/>` +
  // faint stage stars
  `<g fill='#cbc0e8' opacity='.28'>` +
  `<circle cx='30' cy='24' r='1.6'/><circle cx='120' cy='58' r='1.2'/><circle cx='210' cy='20' r='1.5'/>` +
  `<circle cx='300' cy='48' r='1.3'/><circle cx='70' cy='150' r='1.2'/><circle cx='330' cy='140' r='1.4'/>` +
  `<circle cx='160' cy='120' r='1.1'/><circle cx='40' cy='262' r='1.4'/><circle cx='250' cy='276' r='1.2'/>` +
  `</g>` +
  // ride cymbal on a stand (top-left)
  `<g opacity='.6'>` +
  `<line x1='76' y1='92' x2='76' y2='160' stroke='#5d5378' stroke-width='3'/>` +
  `<ellipse cx='76' cy='88' rx='38' ry='8' fill='#e8c25a' transform='rotate(-7 76 88)'/>` +
  `<circle cx='76' cy='86' r='4' fill='#b8933c'/>` +
  `</g>` +
  // hi-hat (right)
  `<g opacity='.55'>` +
  `<line x1='268' y1='84' x2='268' y2='150' stroke='#5d5378' stroke-width='3'/>` +
  `<ellipse cx='268' cy='76' rx='27' ry='6' fill='#e8c25a' transform='rotate(5 268 76)'/>` +
  `<ellipse cx='268' cy='84' rx='27' ry='6' fill='#caa64d' transform='rotate(-4 268 84)'/>` +
  `</g>` +
  // kick drum (center-low) with hoop
  `<g opacity='.6'>` +
  `<circle cx='170' cy='226' r='40' fill='#332856'/>` +
  `<circle cx='170' cy='226' r='40' fill='none' stroke='#7a5aa0' stroke-width='5'/>` +
  `<circle cx='170' cy='226' r='27' fill='#241b3a' stroke='#8f7ec0' stroke-width='2'/>` +
  `<circle cx='170' cy='226' r='5' fill='#e8c25a' opacity='.7'/>` +
  `</g>` +
  // snare drum (left-low)
  `<g opacity='.55'>` +
  `<rect x='22' y='224' width='58' height='22' rx='4' fill='#43356e'/>` +
  `<ellipse cx='51' cy='224' rx='29' ry='8' fill='#d9d3e8'/>` +
  `<ellipse cx='51' cy='246' rx='29' ry='7' fill='#332856'/>` +
  `</g>` +
  // crossed drumsticks (top-right low)
  `<g stroke='#c9a86a' stroke-width='4' stroke-linecap='round' opacity='.6'>` +
  `<line x1='288' y1='206' x2='330' y2='248'/><line x1='330' y1='206' x2='288' y2='248'/>` +
  `</g>` +
  `<circle cx='288' cy='206' r='4' fill='#e0c088' opacity='.6'/>` +
  `<circle cx='330' cy='206' r='4' fill='#e0c088' opacity='.6'/>` +
  // dim golden notes drifting
  `<g font-family='Georgia, serif' font-weight='bold' opacity='.34' fill='#e8c25a'>` +
  `<text x='140' y='66' font-size='22' transform='rotate(-8 140 66)'>&#9834;</text>` +
  `<text x='196' y='96' font-size='18' transform='rotate(10 196 96)'>&#9835;</text>` +
  `<text x='16' y='196' font-size='20' transform='rotate(8 16 196)'>&#9833;</text>` +
  `<text x='308' y='180' font-size='18' transform='rotate(-10 308 180)'>&#9834;</text>` +
  `<text x='236' y='286' font-size='20' transform='rotate(6 236 286)'>&#9835;</text>` +
  `</g></svg>`;

/** K-pop mode: BTS-style purplish blue with bokeh glow, purple hearts, neon notes. */
export const MUSIC_BG_KPOP =
  `<svg xmlns='http://www.w3.org/2000/svg' width='340' height='300' viewBox='0 0 340 300'>` +
  `<defs><linearGradient id='bora' x1='0' y1='0' x2='1' y2='1'>` +
  `<stop offset='0' stop-color='#2f2a72'/><stop offset='0.55' stop-color='#4a3a9c'/>` +
  `<stop offset='1' stop-color='#6a4fc4'/></linearGradient></defs>` +
  `<rect width='340' height='300' fill='url(#bora)'/>` +
  // soft bokeh glow
  `<g opacity='.2'>` +
  `<circle cx='60' cy='60' r='34' fill='#b39df0'/><circle cx='300' cy='40' r='24' fill='#8fd3ff'/>` +
  `<circle cx='230' cy='120' r='16' fill='#ff9fd0'/><circle cx='40' cy='210' r='22' fill='#8fd3ff'/>` +
  `<circle cx='320' cy='230' r='30' fill='#b39df0'/><circle cx='150' cy='40' r='12' fill='#ff9fd0'/>` +
  `</g>` +
  // purple hearts (borahae 💜) at different sizes/tilts
  `<g fill='#c9a2f5' opacity='.55'>` +
  `<path transform='translate(96 96) scale(2.2) rotate(-12)' d='M0 3 C0 .8 1.6 -.4 3 .9 C4.4 -.4 6 .8 6 3 C6 5 3 7.2 3 7.2 C3 7.2 0 5 0 3 Z'/>` +
  `<path transform='translate(258 176) scale(1.7) rotate(10)' d='M0 3 C0 .8 1.6 -.4 3 .9 C4.4 -.4 6 .8 6 3 C6 5 3 7.2 3 7.2 C3 7.2 0 5 0 3 Z'/>` +
  `<path transform='translate(36 268) scale(1.4) rotate(-8)' d='M0 3 C0 .8 1.6 -.4 3 .9 C4.4 -.4 6 .8 6 3 C6 5 3 7.2 3 7.2 C3 7.2 0 5 0 3 Z'/>` +
  `<path transform='translate(196 250) scale(1.9) rotate(6)' d='M0 3 C0 .8 1.6 -.4 3 .9 C4.4 -.4 6 .8 6 3 C6 5 3 7.2 3 7.2 C3 7.2 0 5 0 3 Z'/>` +
  `</g>` +
  // neon wavy line with glowing notes (seamless: period 85)
  `<g stroke='#8fd3ff' stroke-width='2' fill='none' opacity='.35'>` +
  `<path d='M0 160 Q 21 148, 42.5 160 T 85 160 T 127.5 160 T 170 160 T 212.5 160 T 255 160 T 297.5 160 T 340 160'/>` +
  `</g>` +
  `<g font-family='Georgia, serif' font-weight='bold' opacity='.75'>` +
  `<text x='30' y='168' font-size='24' fill='#ff9fd0' transform='rotate(-9 30 168)'>&#9834;</text>` +
  `<text x='122' y='152' font-size='27' fill='#8fd3ff' transform='rotate(8 122 152)'>&#9835;</text>` +
  `<text x='208' y='170' font-size='23' fill='#ffffff' transform='rotate(-6 208 170)'>&#9833;</text>` +
  `<text x='288' y='150' font-size='25' fill='#c9a2f5' transform='rotate(9 288 150)'>&#9834;</text>` +
  `</g>` +
  // sparkles
  `<g fill='#ffffff' opacity='.55' font-size='13' font-family='Georgia, serif'>` +
  `<text x='150' y='210'>&#10022;</text><text x='72' y='138'>&#10023;</text>` +
  `<text x='306' y='96'>&#10022;</text><text x='232' y='58'>&#10023;</text>` +
  `<text x='120' y='288'>&#10022;</text>` +
  `</g></svg>`;
