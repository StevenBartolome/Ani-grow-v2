import { MaterialIcons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTextStyles } from '../constants/textStyles';
import { createTheme } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

interface FloatingLabelInputProps extends TextInputProps {
  label: string;
  icon?: keyof typeof MaterialIcons.glyphMap;
  isPassword?: boolean;
  error?: string;
  backgroundColor?: string;
}

export default function FloatingLabelInput({
  label,
  icon,
  isPassword,
  error,
  value,
  onChangeText,
  backgroundColor,
  ...rest
}: FloatingLabelInputProps) {

  const { colors } = useTheme();
  const theme = createTheme(colors);
  const textStyles = useTextStyles();

  const inputRef = useRef<TextInput>(null);

  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(isFocused || !!value ? 1 : 0, { duration: 160 });
  }, [isFocused, value]);

  const labelAnimatedStyle = useAnimatedStyle(() => {
    const translateY = interpolate(progress.value, [0, 1], [18, -12]);
    const scale = interpolate(progress.value, [0, 1], [1, 0.85]);
    return {
      transform: [{ translateY }, { scale }],
    };
  });

  const borderColor = error ? colors.error : (isFocused ? colors.primary : colors.stroke);

  return (
    <View style={styles.container}>

      <Pressable
        onPress={() => inputRef.current?.focus()}
        style={styles.pressable}
      >

        <Animated.Text
          pointerEvents="none"
          style={[
            textStyles.body,
            styles.label,
            labelAnimatedStyle,
            {
              color: error ? colors.error : (isFocused ? colors.primary : colors.textGrey),
              backgroundColor: backgroundColor || colors.bgLight,
              fontFamily:
                isFocused || !!value
                  ? 'Poppins-Medium'
                  : 'Poppins-Regular',
            },
          ]}
        >
          {label}
        </Animated.Text>

        <View
          style={[
            styles.inputContainer,
            {
              borderColor,
              backgroundColor: backgroundColor || theme.components.input.fill,
              borderRadius: theme.components.input.radius,
            },
          ]}
        >

          {icon && (
            <MaterialIcons
              name={icon}
              size={20}
              color={isFocused ? colors.primary : colors.icon}
              style={styles.icon}
            />
          )}

          <TextInput
            ref={inputRef}
            style={[
              textStyles.body,
              styles.input,
              { color: colors.text },
            ]}
            value={value}
            onChangeText={onChangeText}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            secureTextEntry={isPassword && !showPassword}
            placeholderTextColor="transparent"
            {...rest}
          />

          {isPassword && (
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              style={styles.eyeButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialIcons
                name={showPassword ? 'visibility' : 'visibility-off'}
                size={20}
                color={colors.icon}
              />
            </TouchableOpacity>
          )}

        </View>

      </Pressable>

      {error ? (
        <Animated.Text style={[textStyles.label, { color: colors.error, marginTop: 4, marginLeft: 16, fontSize: 12 }]}>
          {error}
        </Animated.Text>
      ) : null}

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
    width: '100%',
  },
  pressable: {
    width: '100%',
  },
  label: {
    position: 'absolute',
    left: 48,
    paddingHorizontal: 4,
    zIndex: 10,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    height: 58,
    paddingHorizontal: 16,
  },
  icon: {
    width: 24,
    textAlign: 'center',
  },
  input: {
    flex: 1,
    height: '100%',
    marginLeft: 12,
  },
  eyeButton: {
    padding: 8,
  },
});
