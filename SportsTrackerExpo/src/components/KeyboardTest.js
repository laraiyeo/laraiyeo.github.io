import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';

// Simple test component to verify keyboard controller works
const KeyboardTest = () => {
  const [text, setText] = useState('');

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Keyboard Controller Test</Text>
      
      <View style={styles.content}>
        <Text>This area should not move when keyboard appears</Text>
      </View>

      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Type here to test keyboard behavior..."
            multiline
          />
        </View>
      </KeyboardStickyView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 50,
    marginBottom: 20,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  inputContainer: {
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    maxHeight: 100,
  },
});

export default KeyboardTest;