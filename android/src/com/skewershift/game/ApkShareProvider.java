package com.skewershift.game;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

public final class ApkShareProvider extends ContentProvider {
    static final String MIME = "application/vnd.android.package-archive";
    private static final String NAME = "Skewer-Shift.apk";

    @Override public boolean onCreate() { return true; }

    @Override public String getType(Uri uri) {
        return valid(uri) ? MIME : null;
    }

    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (!valid(uri) || !"r".equals(mode)) throw new FileNotFoundException();
        return ParcelFileDescriptor.open(packageFile(), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String order) {
        if (!valid(uri)) return null;
        String[] columns = projection == null
            ? new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE } : projection;
        MatrixCursor cursor = new MatrixCursor(columns, 1);
        MatrixCursor.RowBuilder row = cursor.newRow();
        for (String column : columns) {
            if (OpenableColumns.DISPLAY_NAME.equals(column)) row.add(NAME);
            else if (OpenableColumns.SIZE.equals(column)) row.add(packageFile().length());
            else row.add(null);
        }
        return cursor;
    }

    private static boolean valid(Uri uri) { return ("/" + NAME).equals(uri.getPath()); }
    private File packageFile() { return new File(getContext().getApplicationInfo().sourceDir); }

    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri uri, String selection, String[] args) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] args) { throw new UnsupportedOperationException(); }
}
