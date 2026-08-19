package com.dalbran.distribuidora;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Plugin de atualização completa (APK) feita DENTRO do aplicativo:
 *   - downloadApk: baixa o APK para o armazenamento interno (com progresso);
 *   - installApk: instala via FileProvider, solicitando a permissão nativa
 *     "Instalar apps desconhecidos" quando necessário;
 *   - requestStoragePermissions: pede permissão de armazenamento (legado).
 *
 * Uso (JS):
 *   ApkInstaller.downloadApk({ url, fileName }) -> { filePath, size }
 *   ApkInstaller.installApk({ filePath })      -> {} | { needsPermission, message }
 *   ApkInstaller.requestStoragePermissions()   -> { granted }
 */
@CapacitorPlugin(
    name = "ApkInstaller",
    permissions = {
        @Permission(alias = "storage", strings = {
            Manifest.permission.WRITE_EXTERNAL_STORAGE,
            Manifest.permission.READ_EXTERNAL_STORAGE
        })
    }
)
public class ApkInstallerPlugin extends Plugin {

    // ---------------------------------------------------------------
    // Permissões de armazenamento (legado: Android 6–9)
    // ---------------------------------------------------------------
    @PluginMethod
    public void requestStoragePermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            call.resolve(new JSObject().put("granted", true));
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // Android 10+ (scoped storage): o app grava no próprio armazenamento
            // interno, sem necessidade de permissão de armazenamento.
            call.resolve(new JSObject().put("granted", true));
            return;
        }
        Context ctx = getContext();
        boolean granted = ctx.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
        if (granted) {
            call.resolve(new JSObject().put("granted", true));
            return;
        }
        requestPermissionForAlias("storage", call, "storagePermissionCallback");
    }

    @PermissionCallback
    private void storagePermissionCallback(PluginCall call) {
        Context ctx = getContext();
        boolean granted = Build.VERSION.SDK_INT < Build.VERSION_CODES.M ||
            ctx.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
        call.resolve(new JSObject().put("granted", granted));
    }

    // ---------------------------------------------------------------
    // Download interno do APK (com progresso)
    // ---------------------------------------------------------------
    @PluginMethod
    public void downloadApk(PluginCall call) {
        String url = call.getString("url");
        String fileName = call.getString("fileName");
        if (url == null || url.isEmpty() || fileName == null || fileName.isEmpty()) {
            call.reject("Parâmetros url e fileName são obrigatórios.");
            return;
        }
        new Thread(() -> {
            InputStream in = null;
            FileOutputStream fos = null;
            HttpURLConnection conn = null;
            try {
                File dir = new File(getContext().getCacheDir(), "updates");
                if (!dir.exists() && !dir.mkdirs()) {
                    call.reject("Não foi possível criar o diretório de download.");
                    return;
                }
                File out = new File(dir, fileName);
                if (out.exists()) out.delete();

                conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setInstanceFollowRedirects(true);
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(30000);
                conn.setRequestProperty("User-Agent", "Dalbran-PRO/0.0.8");
                conn.connect();

                int code = conn.getResponseCode();
                if (code < 200 || code >= 300) {
                    call.reject("Falha no download (HTTP " + code + ").");
                    return;
                }

                long total = conn.getContentLengthLong();
                in = conn.getInputStream();
                fos = new FileOutputStream(out);

                byte[] buffer = new byte[8192];
                int n;
                long loaded = 0;
                while ((n = in.read(buffer)) != -1) {
                    fos.write(buffer, 0, n);
                    loaded += n;
                    JSObject ev = new JSObject();
                    ev.put("loaded", loaded);
                    ev.put("total", total);
                    ev.put("percent", total > 0 ? (int) Math.min(100, loaded * 100 / total) : 0);
                    notifyListeners("progress", ev, true);
                }
                fos.flush();

                JSObject res = new JSObject();
                res.put("filePath", out.getAbsolutePath());
                res.put("size", loaded);
                call.resolve(res);
            } catch (Exception e) {
                call.reject("Erro ao baixar o APK: " + e.getMessage());
            } finally {
                try { if (fos != null) fos.close(); } catch (Exception ignored) {}
                try { if (in != null) in.close(); } catch (Exception ignored) {}
                try { if (conn != null) conn.disconnect(); } catch (Exception ignored) {}
            }
        }).start();
    }

    // ---------------------------------------------------------------
    // Instalação do APK (FileProvider + permissão de instalação)
    // ---------------------------------------------------------------
    @PluginMethod
    public void installApk(PluginCall call) {
        String filePath = call.getString("filePath");
        if (filePath == null || filePath.isEmpty()) {
            call.reject("filePath é obrigatório.");
            return;
        }
        File apkFile = new File(filePath);
        if (!apkFile.exists() || apkFile.length() == 0) {
            call.reject("Arquivo do APK não encontrado. Faça o download novamente.");
            return;
        }

        // Android 8+: precisa de "Instalar apps desconhecidos" habilitado para este app
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent intent = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName())
            );
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);

            JSObject res = new JSObject();
            res.put("needsPermission", true);
            res.put("message", "Toque em 'Permitir instalar aplicativos desconhecidos' para o Dalbran PRO e volte ao app para concluir a instalação.");
            call.resolve(res);
            return;
        }

        try {
            Uri apkUri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                apkFile
            );
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Erro ao iniciar a instalação: " + e.getMessage());
        }
    }
}