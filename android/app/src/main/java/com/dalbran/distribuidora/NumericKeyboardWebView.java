package com.dalbran.distribuidora;

import android.content.Context;
import android.util.AttributeSet;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;

import com.getcapacitor.CapacitorWebView;

/**
 * Subclasse do CapacitorWebView que força o InputType nativo do teclado
 * Android (TYPE_CLASS_NUMBER / TYPE_NUMBER_FLAG_DECIMAL) mesmo quando o
 * captureInput está habilitado no Capacitor, que normalmente ignora o
 * inputmode/type dos inputs HTML e abre o teclado QWERTY.
 */
public class NumericKeyboardWebView extends CapacitorWebView {

    private volatile int forcedInputType = -1;

    public NumericKeyboardWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    /**
     * Define o InputType a ser aplicado quando o teclado for solicitado.
     * Use -1 (ou resetForcedInputType) para comportamento padrão.
     */
    public void setForcedInputType(int inputType) {
        this.forcedInputType = inputType;
    }

    public void resetForcedInputType() {
        this.forcedInputType = -1;
    }

    @Override
    public InputConnection onCreateInputConnection(EditorInfo outAttrs) {
        InputConnection ic = super.onCreateInputConnection(outAttrs);
        if (forcedInputType != -1) {
            outAttrs.inputType = forcedInputType;
            outAttrs.imeOptions = EditorInfo.IME_ACTION_DONE;
        }
        return ic;
    }
}
