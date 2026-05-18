import React from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import { Image } from 'expo-image';

interface AnimalIconProps {
  type: 'Pig' | 'Chicken' | 'Pigs' | 'Chickens' | 'pig' | 'chicken';
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

export const AnimalIcon: React.FC<AnimalIconProps> = ({ type, size = 24, color, style }) => {
  const isPig = type.toLowerCase().startsWith('pig');
  const source = isPig 
    ? require('../../assets/icons/pig.svg') 
    : require('../../assets/icons/chicken.svg');

  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Image
        source={source}
        style={{ width: size, height: size }}
        contentFit="contain"
        tintColor={color}
      />
    </View>
  );
};
