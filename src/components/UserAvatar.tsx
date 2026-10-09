import React from 'react';

interface UserAvatarProps {
  avatar?: string;
  username?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export const PRESET_AVATARS = [
  '🎧', '♠️', '👑', '🎲', '💎', '🎙️', '🎷', '🔥', '⭐', '🃏', '🂡', '🦁'
];

export async function processImageUpload(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    // Validate file size (max 8MB before compression)
    if (file.size > 8 * 1024 * 1024) {
      reject(new Error('Image file is too large. Please select a photo under 8MB.'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image format.'));
      img.onload = () => {
        // Create offscreen canvas for square cropping & compression
        const canvas = document.createElement('canvas');
        const MAX_DIM = 160;
        let width = img.width;
        let height = img.height;

        // Crop to square from center
        const minDim = Math.min(width, height);
        const startX = (width - minDim) / 2;
        const startY = (height - minDim) / 2;

        canvas.width = MAX_DIM;
        canvas.height = MAX_DIM;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not process image canvas.'));
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, startX, startY, minDim, minDim, 0, 0, MAX_DIM, MAX_DIM);

        // Convert to lightweight JPEG data URL
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve(dataUrl);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  avatar,
  username = 'Player',
  size = 'md',
  className = '',
}) => {
  const sizeClasses = {
    xs: 'w-6 h-6 text-xs',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-14 h-14 text-lg',
    xl: 'w-20 h-20 text-2xl',
  };

  const isExplicitUrl =
    avatar &&
    (avatar.startsWith('data:image/') ||
      avatar.startsWith('http://') ||
      avatar.startsWith('https://') ||
      avatar.startsWith('blob:'));

  const isBase64WithoutPrefix =
    avatar &&
    !isExplicitUrl &&
    avatar.length > 30 &&
    (avatar.startsWith('/9j/') ||
      avatar.startsWith('iVBORw') ||
      /^[A-Za-z0-9+/=]+$/.test(avatar.slice(0, 50)));

  const imageSrc = isExplicitUrl
    ? avatar
    : isBase64WithoutPrefix
    ? `data:image/jpeg;base64,${avatar}`
    : null;

  const isEmojiPreset = Boolean(avatar && !imageSrc && avatar.length <= 8);

  const initials = username.slice(0, 2).toUpperCase() || 'HM';

  if (imageSrc) {
    return (
      <div
        className={`relative rounded-full overflow-hidden shrink-0 border border-amber-500/40 shadow-sm bg-slate-900 ${sizeClasses[size]} ${className}`}
      >
        <img
          src={imageSrc}
          alt={`${username}'s profile picture`}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  if (isEmojiPreset) {
    return (
      <div
        className={`rounded-full shrink-0 border border-amber-500/40 shadow-sm bg-slate-900 flex items-center justify-center select-none ${sizeClasses[size]} ${className}`}
      >
        <span>{avatar}</span>
      </div>
    );
  }

  return (
    <div
      className={`rounded-full shrink-0 bg-linear-to-tr from-amber-600 to-amber-400 p-0.5 shadow-sm shadow-amber-500/20 ${sizeClasses[size]} ${className}`}
    >
      <div className="w-full h-full bg-slate-950 rounded-full flex items-center justify-center font-black text-amber-400 select-none">
        {initials}
      </div>
    </div>
  );
};
