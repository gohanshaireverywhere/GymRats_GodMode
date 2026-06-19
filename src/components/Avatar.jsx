const BG_COLORS = [
  'bg-orange-500', 'bg-blue-500', 'bg-green-500', 'bg-purple-500',
  'bg-red-500', 'bg-teal-500', 'bg-pink-500', 'bg-yellow-500', 'bg-indigo-500',
];

function charCode(name) {
  return (name || '?').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
}

export default function Avatar({ url, name = '?', size = 'md' }) {
  const sizeClass = {
    xs: 'w-6 h-6 text-xs',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-xl',
  }[size] || 'w-10 h-10 text-sm';

  const initials = name
    .split(' ')
    .map(p => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const bg = BG_COLORS[charCode(name) % BG_COLORS.length];

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className={`${sizeClass} rounded-full object-cover flex-shrink-0`}
        onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
      />
    );
  }

  return (
    <div className={`${sizeClass} ${bg} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0`}>
      {initials}
    </div>
  );
}
