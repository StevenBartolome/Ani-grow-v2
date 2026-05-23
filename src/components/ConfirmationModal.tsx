import React from 'react';
import {
  Modal,
  StyleSheet,
  TouchableOpacity,
  View,
  Pressable,
  Platform,
} from 'react-native';
import { Text } from '@/components/Text';
import { useTheme } from '@/context/ThemeContext';
import { useTextStyles } from '@/constants/textStyles';

interface ConfirmationModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}) => {
  const { colors } = useTheme();
  const textStyles = useTextStyles();

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable onPress={onCancel} style={{ flex: 1 }}>
        <View style={styles.overlay}>
          <Pressable>
            <View style={[styles.modalContainer, { backgroundColor: colors.surface }]}>
              
              <Text style={[textStyles.h2, { color: colors.text, textAlign: 'center' }]}>
                {title}
              </Text>
              
              <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', marginTop: 12, marginBottom: 24 }]}>
                {message}
              </Text>

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={onCancel}
                  style={[styles.button, { borderColor: colors.stroke, borderWidth: 1 }]}
                >
                  <Text style={[textStyles.label, { color: colors.textGrey }]}>
                    {cancelLabel}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={onConfirm}
                  style={[styles.button, { backgroundColor: colors.primary }]}
                >
                  <Text style={[textStyles.btnLabel, { color: colors.onPrimary }]}>
                    {confirmLabel}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContainer: {
    width: '90%',
    maxWidth: 400,
    padding: 24,
    borderRadius: 24,
    ...Platform.select({
      web: {
        boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.25)',
      },
      default: {
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
      },
    }),
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
