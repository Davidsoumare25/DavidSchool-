# DavidSchool-
# 🛍️ MarchéPlus — Marketplace

Application React complète avec Supabase comme base de données.

---

## 📁 Structure des fichiers

```
marcheplus/
├── public/
│   └── index.html          ← Page HTML principale
├── src/
│   ├── index.js            ← Point d'entrée React
│   ├── index.css           ← Styles globaux
│   ├── App.js              ← Application complète
│   └── supabaseClient.js   ← Config Supabase + SQL
├── package.json            ← Dépendances
└── README.md               ← Ce fichier
```

---

## 🚀 Installation

### 1. Installer les dépendances
```bash
npm install
```

### 2. Configurer Supabase

1. Allez sur [supabase.com](https://supabase.com) → Créez un projet gratuit
2. Dans **Settings → API**, copiez :
   - **Project URL** → collez dans `SUPABASE_URL`
   - **anon public key** → collez dans `SUPABASE_ANON_KEY`
3. Ouvrez `src/supabaseClient.js` et remplacez les valeurs

### 3. Créer les tables dans Supabase

1. Allez dans **SQL Editor** sur Supabase
2. Copiez tout le SQL dans les commentaires de `src/supabaseClient.js`
3. Exécutez le SQL (bouton **Run**)

### 4. Lancer l'application
```bash
npm start
```

---

## 🗄️ Base de données Supabase

| Table             | Description                        |
|-------------------|------------------------------------|
| `profiles`        | Profils utilisateurs               |
| `products`        | Annonces publiées                  |
| `product_photos`  | Photos des annonces                |
| `conversations`   | Conversations entre utilisateurs   |
| `messages`        | Messages de chaque conversation    |

**Storage Buckets :**
- `products` → Photos des annonces
- `avatars`  → Photos de profil

---

## ✨ Fonctionnalités

- ✅ Inscription / Connexion (Supabase Auth)
- ✅ Publication d'annonces avec vraies photos
- ✅ Upload photos → Supabase Storage
- ✅ Messagerie temps réel (Supabase Realtime)
- ✅ Profil modifiable avec photo
- ✅ Recherche et filtres
- ✅ Suppression d'annonces

---

## 🌍 Déploiement (Vercel)

```bash
npm install -g vercel
vercel
```

Ou **Netlify** : glissez le dossier `build/` après `npm run build`.
