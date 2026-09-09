import React from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import { Image } from 'expo-image';

export interface AniWeighIconProps {
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export const AniWeighIcon: React.FC<AniWeighIconProps> = ({ size = 24, style }) => {
  const visualSize = Math.round(size * 1.18);
  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Image
        source={require('../../assets/icons/ani-weigh-icon.svg')}
        style={{ width: visualSize, height: visualSize }}
        contentFit="contain"
      />
    </View>
  );
};

export default AniWeighIcon;
