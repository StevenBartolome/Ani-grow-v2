import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { AniFeedIcon } from './AniFeedIcon';
import { AniWeighIcon } from './AniWeighIcon';

export interface DeviceIconProps {
  type?: 'AniFeed' | 'AniWeigh' | 'anifeed' | 'aniweigh' | 'feeder' | 'scale' | string | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export const DeviceIcon: React.FC<DeviceIconProps> = ({ type, size = 24, style }) => {
  const normalized = (type ?? '').toLowerCase();
  const isWeigh = normalized.includes('weigh') || normalized.includes('scale');

  if (isWeigh) {
    return <AniWeighIcon size={size} style={style} />;
  }
  return <AniFeedIcon size={size} style={style} />;
};

export default DeviceIcon;
