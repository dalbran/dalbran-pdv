package com.dalbran.distribuidora;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Process;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Plugin que reinicia o aplicativo (fecha e reabre) de forma limpa.
 *
 * Uso:
 *   Restart.restartApp();
 */
@CapacitorPlugin(name = "Restart")
public class RestartPlugin extends Plugin {

    @PluginMethod
    public void restartApp(PluginCall call) {
        Context ctx = getContext();
        Intent intent = new Intent(ctx, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);

        int requestCode = 0xDA1B;
        PendingIntent pendingIntent = PendingIntent.getActivity(
            ctx,
            requestCode,
            intent,
            PendingIntent.FLAG_CANCEL_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        AlarmManager alarmManager = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager != null) {
            // Agenda a reabertura e depois encerra o processo (arranque limpo)
            alarmManager.set(AlarmManager.RTC, System.currentTimeMillis() + 250, pendingIntent);
        }

        call.resolve();

        // Encerra o processo atual para a nova instância iniciar limpa
        new Thread(() -> {
            try { Thread.sleep(150); } catch (InterruptedException e) { /* ignore */ }
            Process.killProcess(Process.myPid());
        }).start();
    }
}