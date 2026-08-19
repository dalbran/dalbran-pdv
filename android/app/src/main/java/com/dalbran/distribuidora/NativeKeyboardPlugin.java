package com.dalbran.distribuidora;

import android.content.Context;
import android.text.InputType;
import android.view.View;
import android.view.inputmethod.InputMethodManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Plugin que permite ao JS definir o tipo de teclado nativo do Android
 * para o campo atualmente focado.
 *
 * Chamadas:
 *   NativeKeyboard.setInputType({ mode: 'int' })      -> TYPE_CLASS_NUMBER
 *   NativeKeyboard.setInputType({ mode: 'decimal' })  -> TYPE_CLASS_NUMBER | TYPE_NUMBER_FLAG_DECIMAL
 *   NativeKeyboard.setInputType({ mode: 'text' })     -> comportamento padrão (reseta)
 */
@CapacitorPlugin(name = "NativeKeyboard")
public class NativeKeyboardPlugin extends Plugin {

    @PluginMethod
    public void setInputType(PluginCall call) {
        String mode = call.getString("mode", "text");
        int inputType = -1;

        if ("int".equals(mode)) {
            inputType = InputType.TYPE_CLASS_NUMBER;
        } else if ("decimal".equals(mode)) {
            inputType = InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL;
        }

        View view = getBridge().getWebView();
        if (view instanceof NumericKeyboardWebView) {
            NumericKeyboardWebView webView = (NumericKeyboardWebView) view;
            if (inputType == -1) {
                webView.resetForcedInputType();
            } else {
                webView.setForcedInputType(inputType);
            }

            // Força o Android a recriar o InputConnection com o novo EditorInfo
            InputMethodManager imm = (InputMethodManager) getContext().getSystemService(Context.INPUT_METHOD_SERVICE);
            if (imm != null) {
                imm.restartInput(view);
            }
        }

        call.resolve();
    }
}
