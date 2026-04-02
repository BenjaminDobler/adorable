# Translations

The Translations panel helps you manage multi-language content in your project.

## Opening Translations

Click the **i18n** tab (globe icon) in the left sidebar.

## How It Works

If your project uses a translation library (ngx-translate or Transloco), the Translations panel shows your translation keys and values. You can:

- View all translation keys and their values
- Edit translations directly in the panel
- Changes are applied live in the preview without a full reload

## Live Reload

When you edit a translation file, Adorable attempts a smart reload — it finds the translation service in your running app and updates strings in place. If that fails, it falls back to a full page reload.
