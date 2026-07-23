export const RAW = 'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/';
export const CATPT = { 'chest': 'Peito', 'back': 'Costas', 'shoulders': 'Ombros', 'upper arms': 'Braços', 'lower arms': 'Antebraços', 'upper legs': 'Pernas', 'lower legs': 'Panturrilhas', 'waist': 'Abdômen', 'cardio': 'Cardio', 'neck': 'Pescoço' };
export const EQPT = { 'body weight': 'Peso corporal', 'dumbbell': 'Halter', 'barbell': 'Barra', 'cable': 'Cabo', 'leverage machine': 'Máquina', 'smith machine': 'Smith', 'band': 'Elástico', 'kettlebell': 'Kettlebell', 'ez barbell': 'Barra EZ', 'weighted': 'Com peso', 'stability ball': 'Bola suíça' };
export const AMBER = '#F5F1E6';
export const AMBER_GRAD = 'rgba(245,241,230,.96)';
export const CIRC = 540.35;
export const SKELETON = 'background:linear-gradient(90deg, rgba(255,255,255,.05) 25%, rgba(255,255,255,.14) 37%, rgba(255,255,255,.05) 63%);background-size:400% 100%;animation:skeleton 1.4s ease infinite';

const EQUIP_SUFFIX = { barbell: 'barra', dumbbell: 'halteres', dumbbells: 'halteres', cable: 'cabo', band: 'elástico', bands: 'elásticos', kettlebell: 'kettlebell', machine: 'máquina', lever: 'máquina', smith: 'smith', ez: 'barra EZ', weighted: 'peso extra', bodyweight: 'peso do corpo', body: 'peso do corpo', assisted: 'assistência', stability: 'bola suíça', ball: 'bola' };
const STYLE_PREFIX = { seated: 'sentado', standing: 'em pé', lying: 'deitado', incline: 'inclinado', decline: 'declinado', kneeling: 'ajoelhado', alternate: 'alternado', alternating: 'alternado', single: 'unilateral', reverse: 'invertido', close: 'pegada fechada', wide: 'pegada aberta', narrow: 'pegada fechada', neutral: 'pegada neutra', flat: 'reto', sumo: 'sumô', romanian: 'romeno', bulgarian: 'búlgaro', conventional: 'convencional', full: 'completo', half: 'parcial', elevated: 'elevado', crossover: 'cruzado', cross: 'cruzado', assisted2: 'assistido' };
const COMPOUND = [
  ['overhead triceps extension', 'tríceps francês'], ['triceps extension', 'tríceps francês'], ['skull crushers', 'tríceps testa'], ['skull crusher', 'tríceps testa'],
  ['bench press', 'supino'], ['shoulder press', 'desenvolvimento'], ['overhead press', 'desenvolvimento militar'],
  ['leg extension', 'cadeira extensora'], ['leg curl', 'mesa flexora'], ['leg press', 'leg press'],
  ['lateral raise', 'elevação lateral'], ['front raise', 'elevação frontal'], ['rear delt raise', 'elevação posterior'], ['calf raise', 'elevação de panturrilha'],
  ['chest fly', 'crucifixo'], ['pec fly', 'crucifixo'], ['flyes', 'crucifixo'], ['flye', 'crucifixo'], ['fly', 'crucifixo'],
  ['seated row', 'remada sentada'], ['bent over row', 'remada curvada'], ['upright row', 'remada alta'], ['row', 'remada'],
  ['lat pulldown', 'puxada'], ['pulldown', 'puxada'], ['chin-up', 'barra fixa supinada'], ['pull-up', 'barra fixa'], ['pullup', 'barra fixa'],
  ['push-up', 'flexão de braço'], ['pushup', 'flexão de braço'],
  ['biceps curl', 'rosca bíceps'], ['bicep curl', 'rosca bíceps'], ['hammer curl', 'rosca martelo'], ['preacher curl', 'rosca scott'], ['concentration curl', 'rosca concentrada'], ['curl', 'rosca'],
  ['triceps pushdown', 'tríceps no pulley'], ['pushdown', 'tríceps no pulley'], ['kickback', 'tríceps kickback'],
  ['chest dip', 'mergulho'], ['dips', 'mergulho'], ['dip', 'mergulho'],
  ['full squat', 'agachamento completo'], ['front squat', 'agachamento frontal'], ['squat', 'agachamento'],
  ['deadlift', 'levantamento terra'], ['good morning', 'bom dia'],
  ['lunge', 'avanço'], ['step-up', 'subida no banco'], ['step up', 'subida no banco'],
  ['hip thrust', 'elevação de quadril'], ['glute bridge', 'ponte de glúteo'], ['bridge', 'ponte'],
  ['russian twist', 'giro russo'], ['crunch', 'abdominal'], ['sit-up', 'abdominal reto'], ['plank', 'prancha'],
  ['shrug', 'encolhimento de ombros'], ['face pull', 'face pull'], ['pullover', 'pullover'], ['hyperextension', 'hiperextensão lombar'],
];
const FALLBACK_WORDS = { chest: 'peito', back: 'costas', shoulder: 'ombro', shoulders: 'ombros', biceps: 'bíceps', bicep: 'bíceps', triceps: 'tríceps', tricep: 'tríceps', forearm: 'antebraço', calf: 'panturrilha', calves: 'panturrilhas', hip: 'quadril', glute: 'glúteo', glutes: 'glúteos', hamstring: 'posterior de coxa', quad: 'quadríceps', quads: 'quadríceps', neck: 'pescoço', abs: 'abdômen', oblique: 'oblíquo', core: 'core', arm: 'braço', arms: 'braços', leg: 'perna', legs: 'pernas' };

export function translateName(name) {
  if (!name) return name;
  let s = ' ' + name.toLowerCase().replace(/[()]/g, ' ') + ' ';
  let equipPT = null;
  for (const k in EQUIP_SUFFIX) { const re = new RegExp('\\s' + k + '\\s', 'g'); if (re.test(s)) { equipPT = EQUIP_SUFFIX[k]; s = s.replace(re, ' '); break; } }
  const stylePTs = [];
  for (const k in STYLE_PREFIX) { const re = new RegExp('\\s' + k + '\\s', 'g'); if (re.test(s)) { stylePTs.push(STYLE_PREFIX[k]); s = s.replace(re, ' '); } }
  let core = null;
  for (const [key, val] of COMPOUND) { const re = new RegExp('\\s' + key.replace(/[- ]/g, '[- ]') + '\\s'); if (re.test(s)) { core = val; s = s.replace(re, ' '); break; } }
  if (!core) return name.charAt(0).toUpperCase() + name.slice(1);
  const leftoverWords = s.split(' ').filter(Boolean).map(w => FALLBACK_WORDS[w] || null).filter(Boolean);
  const parts = [core, ...stylePTs, ...leftoverWords];
  let out = parts.filter(Boolean).join(' ').trim();
  if (equipPT) out += ' com ' + equipPT;
  if (!out) out = name;
  return out.charAt(0).toUpperCase() + out.slice(1);
}

export const uid = () => Math.random().toString(36).slice(2, 9);
