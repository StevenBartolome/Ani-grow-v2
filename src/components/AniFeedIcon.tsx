import React from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import { Image } from 'expo-image';

export interface AniFeedIconProps {
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export const AniFeedIcon: React.FC<AniFeedIconProps> = ({ size = 24, style }) => {
  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Image
        source={require('../../assets/icons/ani-feed-icon.svg')}
        style={{ width: size, height: size }}
        contentFit="contain"
      />
    </View>
  );
};

export default AniFeedIcon;
