// Tower Money Book: hand-drawn SVG scenes, returned as standalone inline strings.
// Palette rule: paper plus 3–5 consistent CSS token colours per scene; only skin uses literal hex.

let n = 0;
const uid = name => `ill-${name}-${++n}`;
const C = {
  paper: 'var(--ill-paper,#f6f3ec)', ink: 'var(--ill-ink,#1d2730)',
  sky: 'var(--ill-sky,#dce8ee)', ground: 'var(--ill-ground,#c9c2b3)',
  shade: 'var(--ill-shade,#9aa7b1)', coin: 'var(--sym-coin,#f0c13b)',
  brick: 'var(--sym-brick,#c8643b)', plans: 'var(--sym-plans,#4f7cac)',
  clock: 'var(--sym-clock,#9b87c9)', city: 'var(--sym-city,#5b7b95)',
  piggy: 'var(--sym-piggy,#e88fa8)', land: 'var(--sym-land,#4f9b5a)',
  flag: 'var(--sym-flag,#d9534f)', sale: 'var(--sym-sale,#3b74d1)',
  rent: 'var(--sym-rent,#2f9a5e)', operate: 'var(--sym-operate,#8457c9)',
  public: 'var(--sym-public,#e07b32)', support: 'var(--sym-support,#8d98a3)',
  tree: 'var(--sym-tree,#56a865)',
};

const paint = (fill, stroke, width = 1.5) => `style="fill:${fill}${stroke ? `;stroke:${stroke};stroke-width:${width};stroke-linecap:round;stroke-linejoin:round` : ''}"`;
const path = (d, fill = 'none', stroke, width) => `<path d="${d}" ${paint(fill, stroke, width)}/>`;
const rect = (x, y, w, h, fill, stroke, radius = 0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" ${paint(fill, stroke)}/>`;
const circle = (x, y, r, fill, stroke, width) => `<circle cx="${x}" cy="${y}" r="${r}" ${paint(fill, stroke, width)}/>`;
const ellipse = (x, y, rx, ry, fill, stroke) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" ${paint(fill, stroke)}/>`;
const group = (transform, content) => `<g transform="${transform}">${content}</g>`;
const coin = (x, y, r) => circle(x, y, r, C.coin, C.ink, 1) + path(`M${x - r * .3} ${y - r * .5}q${-r * .45} ${r * .5} 0 ${r}`, 'none', C.paper, 1.2);
const person = (x, y, scale = 1, skin = '#c68642', shirt = C.ink) => group(`translate(${x} ${y}) scale(${scale})`,
  circle(0, 0, 5, skin) + path('M-6 8Q0 4 6 8L8 23H-8Z', shirt) + path('M-4 23L-5 35M4 23L7 35', 'none', shirt, 3));
const desk = (x, y, scale = 1) => group(`translate(${x} ${y}) scale(${scale})`,
  path('M0 0H24V3H0ZM3 3V13H5V3M20 3V13H22V3', C.ink) + path('M7-10H19V-3H7ZM13-3V0', C.ink, C.ink, 1));
const bed = (x, y) => group(`translate(${x} ${y})`,
  path('M0-9V8M0 3H35V8', 'none', C.ink, 2) + rect(2, -3, 33, 6, C.shade) + rect(3, -6, 9, 5, C.paper, C.ink, 1));
const bell = (x, y, scale, colour) => group(`translate(${x} ${y}) scale(${scale})`,
  path('M-17 0A17 17 0 0 1 17 0Z', colour) + rect(-21, 1, 42, 4, colour) + path('M0-17V-22M-4-22H4', 'none', colour, 3));
const hall = (x, y, scale = 1) => group(`translate(${x} ${y}) scale(${scale})`,
  path('M0 18L30 0L60 18ZM3 52H57V58H3Z', C.city) + path('M10 22V49M23 22V49M37 22V49M50 22V49', 'none', C.city, 5) + circle(30, 11, 3, C.paper));
const calendar = (x, y, colour = C.ink) => group(`translate(${x} ${y})`,
  rect(0, 0, 24, 27, C.paper, colour, 2) + rect(0, 0, 24, 7, colour) + path('M6-3V3M18-3V3M6 13H9M15 13H18M6 19H9M15 19H18', 'none', colour, 1.5));
const bench = (x, y, scale = 1, colour = C.public) => group(`translate(${x} ${y}) scale(${scale})`,
  rect(0, 0, 65, 6, colour) + path('M5 6V19M60 6V19M0-14H65V-8H0Z', colour, colour, 3));

// Grain is static, faint, and optional for print/reduced-texture uses: { grain: false }.
const frame = (name, title, content, opts) => {
  const id = uid(name);
  const grain = opts.grain === false ? '' : `<defs><filter id="${id}-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".78" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter></defs><rect x="0" y="0" width="360" height="240" ${paint(C.paper)} filter="url(#${id}-grain)" opacity=".035"/>`;
  return `<svg class="scene" viewBox="0 0 360 240" role="img" aria-labelledby="${id}-t" xmlns="http://www.w3.org/2000/svg"><title id="${id}-t">${title}</title>${rect(0, 0, 360, 240, C.paper)}${grain}${content}</svg>`;
};

const stack = (opts = {}) => {
  // Bottom to top: rent, rent, rent, support, operate, sale, sale, operate.
  const floors = [C.rent, C.rent, C.rent, C.support, C.operate, C.sale, C.sale, C.operate]
    .map((colour, i) => {
      const y = 187 - i * 23;
      return `<rect x="121" y="${y}" width="110" height="23" style="fill:${colour};fill-opacity:${i % 2 ? '.32' : '.4'}"/>` +
        (i === 3 ? '' : circle(251, y + 11.5, 6, C.coin) + path(`M250 ${y + 8}h2v7h-2Z`, C.paper));
    }).join('');
  const home = y => group(`translate(147 ${y})`,
    path('M0-10H3V-3H37V-7H40V9H37V5H3V9H0ZM5-8H15V-4H5Z', C.ink) +
    path('M51-1H63V2H60V9H54V2H51ZM54-10H60L63-4H51Z', C.ink));
  const office = y => group(`translate(146 ${y})`,
    path('M0 0H25V3H23V11H21V3H4V11H2V3H0ZM6-9H20V-3H14V0H12V-3H6ZM45 0H70V3H68V11H66V3H49V11H47V3H45ZM51-9H65V-3H59V0H57V-3H51Z', C.ink));
  return frame('stack', 'Eight boxes make a tower: a shop, two offices, a plant floor, a hotel, two homes and an open lookout. Each earns a gold coin except the plant floor.',
    rect(25, 23, 310, 181, C.sky, null, 8) +
    path('M25 199V169H48V148H65V178H86V158H109V198H265V167H282V151H299V177H316V161H335V210H25Z', C.shade) +
    rect(25, 210, 310, 8, C.ground) + rect(121, 26, 110, 184, C.paper) + floors +
    path('M121 141H128V210H121Z', C.rent) + path('M121 118H128V141H121Z', C.support) +
    path('M121 95H128V118H121ZM121 46H231V49H121Z', C.operate) + path('M121 49H128V95H121Z', C.sale) +
    rect(231, 49, 4, 161, C.ink) +
    path('M121 49V210H231M121 49H231M121 72H231M121 95H231M121 118H231M121 141H231M121 164H231M121 187H231', 'none', C.ink, 1) +
    person(149, 29, .5, C.ink) +
    path('M182 34L202 26L205 32L185 40ZM190 39L185 47H188L192 41L198 47H201L193 38Z', C.ink) +
    path('M124 43H228M127 39V49M223 39V49', 'none', C.ink, 1.2) +
    home(62) + home(85) + bell(176, 112, .62, C.ink) +
    group('translate(161 130)', path('M-4-9H4L5-6L9-4V4L6 5L4 9H-4L-5 6L-9 4V-4L-6-5Z', C.ink) + circle(0, 0, 3, C.paper)) +
    path('M182 138V124H198V130H216M206 130V138', 'none', C.ink, 3) +
    office(151) + office(174) +
    path('M124 188H228L233 195H119V192Z', C.rent) +
    path('M135 188H146L144 195H131ZM158 188H169V195H156ZM181 188H192L194 195H181ZM204 188H215L219 195H207Z', C.paper) +
    path('M136 198H178V207H136ZM195 198H216V210H195Z', C.ink) +
    path('M141 200H153V202H141ZM159 200H173V202H159Z', C.paper) +
    person(285, 191, .57, C.ink) + path('M39 224H93M257 224H315', 'none', C.ink), opts);
};

const earn = (opts = {}) => frame('earn', 'A home can be sold, rented, or run as a hotel, while public seats and building machines serve everyone.',
  path('M127 38V135M234 38V135', 'none', C.support, 1) +
  path('M30 77L69 43L108 77V123H30Z', C.sale) + rect(46, 83, 19, 19, C.paper) + rect(78, 91, 16, 32, C.paper) +
  path('M84 52Q106 37 111 56L106 68', 'none', C.sale, 2) +
  path('M96 62L112 64L119 82L100 89L93 71Z', C.paper, C.sale) + circle(102, 69, 2, C.sale) +
  path('M142 108L154 91Q158 86 163 90L175 100H197Q204 100 203 105L182 117H153Z', '#c68642') +
  path('M215 64L202 78L183 81Q178 82 178 77L192 68L201 53Z', '#f1c27d') +
  circle(174, 81, 11, C.rent) + circle(174, 81, 5, C.paper) +
  path('M183 82H214V87H209V94H204V87H183Z', C.rent) +
  rect(251, 106, 77, 19, C.operate) + bell(289, 98, 1, C.operate) +
  path('M41 155H319', 'none', C.support, 1) + rect(44, 203, 154, 8, C.public) + bench(81, 192, .9) +
  circle(98, 167, 5, '#8d5524') + circle(128, 165, 5, '#e0ac69') +
  path('M93 176H103V190H112V202H107V195H93ZM123 174H133V189H143V201H138V194H123Z', C.public) +
  group('translate(267 187)', path('M-7-23H7L9-16L16-9L23-7V7L16 9L9 16L7 23H-7L-9 16L-16 9L-23 7V-7L-16-9L-9-16Z', C.support) + circle(0, 0, 10, C.paper)), opts);

const tree = (opts = {}) => frame('tree', 'A money tree drops coins into a basket over time, and a buyer brings a sack to buy the whole tree.',
  ellipse(145, 199, 111, 23, C.sky) + ellipse(145, 190, 98, 20, C.land) +
  path('M125 185L130 95H141L147 185ZM135 129L108 105L112 98L137 114L157 85L163 90L141 133Z', C.ink) +
  path('M81 99C56 80 76 54 98 54C96 26 133 20 147 39C173 24 196 46 185 67C214 83 197 112 173 107C155 127 132 116 123 109C104 121 85 116 81 99Z', C.tree) +
  coin(101, 69, 8) + coin(139, 53, 9) + coin(170, 82, 8) + coin(130, 94, 7) +
  path('M188 117L190 126M191 146L191 153', 'none', C.ink, 1) + coin(190, 136, 6) +
  path('M169 169Q189 146 210 169M165 168H213L207 194H171Z', C.paper, C.ink, 2) +
  coin(183, 171, 6) + coin(197, 172, 7) + path('M168 179H210M178 180L180 191M190 179V192M202 179L200 191', 'none', C.ink) +
  calendar(218, 175) + person(290, 119, 1.8, '#8d5524') +
  path('M283 142L265 156M298 143L280 159', 'none', '#8d5524', 6) +
  path('M251 147Q239 132 248 132L259 137L271 131L269 147C295 175 289 200 260 200C231 201 224 176 251 147Z', C.paper, C.ink, 2) +
  path('M249 147H270', 'none', C.ink, 3) + coin(259, 176, 12), opts);

const height = (opts = {}) => frame('height', 'Higher homes earn larger coins for their mountain and sea views, while the shop earns coins at street level.',
  path('M180 135L224 80L250 113L286 59L337 135Z', C.shade) +
  path('M212 95L224 80L238 99L226 94L222 99ZM272 80L286 59L304 86L287 78L282 84Z', C.paper) +
  path('M181 139H337V186H181Z', C.sky) + path('M194 153H235M254 162H323M215 175H268', 'none', C.paper, 2) +
  path('M104 54L287 58M104 82L254 139', 'none', C.ink, 1).replace('/>', ' stroke-dasharray="2 6"/>') +
  rect(45, 39, 62, 164, C.paper, C.ink) + rect(52, 46, 48, 133, C.sale) +
  path('M52 72H100M52 99H100M52 126H100M52 153H100M76 46V179', 'none', C.paper, 3) +
  coin(134, 57, 14) + coin(134, 86, 11) + coin(134, 114, 8) + coin(134, 141, 6) + coin(134, 166, 4) +
  path('M42 182H110L115 191H37Z', C.ink) +
  path('M51 182H61L59 191H47ZM75 182H85L87 191H74ZM99 182H108L113 191H102Z', C.paper) +
  rect(52, 194, 20, 15, C.sky, C.ink) + rect(84, 194, 17, 15, C.paper, C.ink) +
  path('M29 210H335', 'none', C.ink, 2) + coin(124, 203, 6) + coin(139, 203, 6), opts);

const costs = (opts = {}) => frame('costs', 'Building takes bricks, blue plans, time, and City permits.',
  path('M45 205V38H185M45 38L65 23L92 38M45 67L67 48M45 91L67 72M45 115L67 96M45 139L67 120M45 163L67 144M67 38V205M25 205H87M159 39V96', 'none', C.ink, 2) +
  path('M159 96Q168 106 157 110M157 110L130 126M157 110L183 126', 'none', C.ink, 1.5) +
  rect(130, 126, 53, 30, C.brick) + path('M130 141H183M147 126V141M166 141V156', 'none', C.paper, 2) +
  rect(91, 185, 72, 22, C.brick) + path('M91 196H163M112 185V196M144 185V196M128 196V207', 'none', C.paper, 2) +
  person(201, 161, 1.1, '#e0ac69') +
  path('M193 161A8 8 0 0 1 209 161ZM190 163H211', C.paper, C.ink) +
  group('translate(206 181) rotate(-18)', rect(-18, -8, 41, 17, C.plans) + ellipse(-18, .5, 4, 8.5, C.paper, C.plans) + path('M-8-2H15M-8 3H5', 'none', C.paper)) +
  circle(256, 68, 34, C.clock) + circle(256, 68, 26, C.paper) +
  path('M256 48V69L271 78M256 39V43M285 68H281M256 97V93M227 68H231', 'none', C.ink, 2) +
  hall(268, 148, .85) +
  group('translate(252 205) rotate(-12)', path('M-10-8H10V0H-10ZM-3-8V-17Q-11-27 0-29Q11-27 3-17V-8Z', C.city) + rect(-14, 3, 28, 5, C.city)) +
  path('M186 214H333', 'none', C.ink), opts);

const profit = (opts = {}) => frame('profit', 'A builder carries a pink piggy bank across a tightrope between towers, with a small safety net below.',
  ellipse(180, 118, 113, 83, C.sky) +
  rect(29, 112, 57, 103, C.shade) + rect(276, 105, 55, 110, C.shade) +
  path('M39 127H76M39 148H76M39 169H76M39 190H76M286 121H321M286 142H321M286 163H321M286 184H321', 'none', C.paper, 4) +
  path('M80 112Q175 138 282 105', 'none', C.ink, 2) +
  path('M118 174Q180 226 242 171L229 202Q180 232 130 204Z', 'none', C.ink, 1.3) +
  path('M118 174L130 204M139 188L147 216M161 197L165 223M184 200V225M208 193L202 221M228 182L219 211M126 191Q181 227 235 187', 'none', C.ink, 1) +
  circle(174, 62, 8, '#c68642') +
  path('M164 61A10 10 0 0 1 184 61H187V65H161V61ZM174 51V60', C.paper, C.ink) +
  path('M167 76Q176 70 184 77L189 97L169 99Z', C.ink) +
  path('M173 97L158 111L171 124M184 97L198 113L217 119M169 79L146 88L132 78M183 80L203 91L220 81', 'none', C.ink, 5) +
  path('M133 78L125 74M221 81L225 77', 'none', '#c68642', 5) +
  group('translate(231 72)', ellipse(0, 0, 23, 16, C.piggy, C.ink) +
    path('M12-12L12-23L22-13M-14 13V22H-7V16M9 14V22H16V12M23-3H30V8H22', C.piggy, C.ink) +
    path('M-23 0Q-35-12-32 1Q-30 7-26 1M-7-11H5', 'none', C.ink, 1.5) + circle(15, -4, 1.5, C.ink)), opts);

const land = (opts = {}) => frame('land', 'The coins left over balance the price of a green piece of land.',
  ellipse(180, 214, 111, 9, C.ground) +
  path('M180 66V203M150 210H210L194 201H166Z', C.ink, C.ink, 5) +
  path('M77 79H283M83 79L57 162M83 79L109 162M277 79L251 162M277 79L303 162', 'none', C.ink, 2) + circle(180, 79, 7, C.paper, C.ink) +
  path('M48 163Q83 195 118 163ZM242 163Q277 195 312 163Z', C.paper, C.ink, 2) +
  coin(68, 151, 10) + coin(88, 151, 10) + coin(104, 153, 8) + coin(79, 133, 10) + coin(96, 135, 8) + coin(86, 115, 9) +
  path('M248 151L264 138H305L292 151V162H248Z', C.land, C.ink) + path('M248 151H292L305 138M292 151V162', 'none', C.ink, 1) +
  path('M277 141V107', 'none', C.ink, 2) + path('M278 107L299 113L278 120Z', C.flag), opts);

const city = (opts = {}) => frame('city', 'The City receives a slice of land value, and a public floor needs care each year.',
  ellipse(105, 198, 73, 10, C.ground) +
  path('M104 142L104 83A59 59 0 1 0 160 160Z', C.land, C.ink, 1.5) +
  path('M50 165Q83 206 135 183', 'none', C.paper, 2) +
  path('M237 91L216 119L190 138Q183 142 177 138L153 127Q149 120 156 118L177 124L193 116L204 97L217 85Z', C.city) +
  path('M134 110L134 51A59 59 0 0 1 190 128Z', C.land, C.ink, 1.5) +
  path('M149 69Q169 74 180 93', 'none', C.paper, 2) +
  path('M202 68Q220 47 242 48M236 42L243 48L237 55', 'none', C.city, 2) + hall(261, 42, 1) +
  rect(208, 204, 121, 10, C.public) + bench(216, 191, .9) +
  circle(232, 163, 5, '#f1c27d') + circle(259, 165, 5, '#8d5524') +
  path('M226 172H236V187H245V201H239V193H226ZM253 174H263V187H273V201H267V193H253Z', C.ink) +
  calendar(299, 174, C.city), opts);

const presales = (opts = {}) => {
  const houses = Array.from({ length: 10 }, (_, i) => {
    const x = 26 + i * 31;
    return group(`translate(${x} 179)`, path('M0 14L14 1L28 14V42H0Z', C.paper, C.ink) +
      rect(10, 28, 8, 14, C.shade) +
      (i < 7 ? path('M18 12L24 15V27H13V15Z', C.sale) + circle(18.5, 17, 1.5, C.paper) : ''));
  }).join('');
  return frame('presales', 'Seven blue-tagged homes out of ten help unlock the bank before the tower is built.',
    rect(70, 31, 221, 140, C.sky, null, 8) + rect(93, 43, 175, 125, C.shade, C.ink, 7) +
    circle(172, 105, 48, C.paper, C.ink) + circle(172, 105, 37, C.shade) +
    path('M172 78V132M145 105H199M153 86L191 124M191 86L153 124', 'none', C.ink, 3) + circle(172, 105, 10, C.paper, C.ink) +
    path('M108 61V80M108 132V151', 'none', C.ink, 6) +
    path('M236 130V117A11 11 0 0 1 258 117V130', 'none', C.ink, 4) + rect(230, 129, 34, 29, C.paper, C.ink, 3) +
    path('M247 138V148', 'none', C.ink, 3) +
    group('translate(294 145) rotate(-29)', circle(0, 0, 8, C.ink) + circle(0, 0, 4, C.paper) + path('M7-2H30V3H27V9H22V3H7Z', C.ink)) +
    path('M24 223H335', 'none', C.ink) + houses, opts);
};

const fsr = (opts = {}) => {
  const floors = Array.from({ length: 9 }, (_, i) => {
    const y = 183 - i * 18;
    return path(`M83 ${y}L120 ${y - 12}H248L211 ${y}Z`, C.shade, C.ink, 1) +
      desk(143, y - 7, .42);
  }).join('');
  return frame('fsr', 'Nine office floors stack above a green site, with each floor covering the same area as the land.',
    ellipse(171, 223, 107, 7, C.ground) +
    path('M83 213L120 201H248L211 213V220H83Z', C.land, C.ink) +
    path('M211 213L248 201V208L211 220Z', C.land, C.ink) +
    path('M83 196V203M211 196V204M248 184V191', 'none', C.ink, 1).replace('/>', ' stroke-dasharray="2 3"/>') +
    floors +
    path('M277 28V214M271 28H287M271 214H287M277 51H283M277 69H283M277 87H283M277 105H283M277 123H283M277 141H283M277 159H283M277 177H283M277 195H283', 'none', C.ink, 1.5) +
    `<text x="294" y="125" font-family="sans-serif" font-size="14" ${paint(C.ink)}>x9</text>`, opts);
};

const leverage = (opts = {}) => frame('leverage', 'A tiny coin pushes the long end of a seesaw down and sends a big pile of coins high into the air.',
  ellipse(112, 99, 65, 65, C.sky) + ellipse(188, 215, 137, 9, C.ground) +
  path('M126 211L147 137L170 211Z', C.ink) +
  path('M67 100L316 187L312 198L63 111Z', C.paper, C.ink, 2) + circle(147, 140, 5, C.paper, C.ink) +
  path('M301 139V163M295 157L301 164L307 157', 'none', C.ink, 1.5) + coin(301, 181, 5) +
  path('M66 95L69 77M78 97L81 83M48 68L43 61M117 58L124 52', 'none', C.ink, 1.5) +
  coin(65, 65, 13) + coin(88, 67, 13) + coin(108, 70, 11) + coin(75, 43, 13) + coin(99, 46, 12) + coin(87, 25, 10), opts);

export const SCENES = { stack, earn, tree, height, costs, profit, land, city, presales, fsr, leverage };
export const SCENE_NAMES = Object.keys(SCENES);
