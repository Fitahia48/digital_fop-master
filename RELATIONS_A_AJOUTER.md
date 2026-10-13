# RELATIONS À AJOUTER & ADAPTATIONS DU SCHÉMA

*Ce fichier documente les relations inter-textes et les adaptations de schéma pour les particularités juridiques.*

## 1. Type de relation juridique « vise » (✅ Implémenté dans Strapi et Front)

Le type de relation `vise` (visas juridiques : « Vu la Constitution », « Vu la loi... ») a été ajouté :
- Au schéma Strapi `api::document-relation.document-relation` (enum : `modifie`, `abroge`, `complete`, `vise`).
- Au contrôleur `strapi-backend/src/api/document-relation/controllers/document-relation.ts` (`ALLOWED_TYPES`).
- À l'interface `DocumentLifecycleModal.jsx` (sélection + badge violet « Vise » / « Est visé par »).
- À la fiche publique `DocumentFiche.jsx` et aux dictionnaires i18n (`fr`, `en`, `mg`).

### Relations prêtes à être saisies :
#### Depuis le Décret n°2024-055
- VISE → Loi n°94-025 (Document 2)
- VISE → Loi n°2003-011 du 3 septembre 2003
- VISE → Loi n°2003-044 du 28 juillet 2004 (Code du Travail)
- VISE → Décret n°76-132 du 31 mars 1976
- VISE → Décret n°2015-1331 du 28 septembre 2015
- VISE → Décret n°2024-007 du 4 janvier 2024
- VISE → Décret n°2024-020 du 14 janvier 2024
- VISE → Constitution

#### Depuis l'Arrêté n°3091
- VISE → Décret n°64-213 du 27 mai 1964
- VISE → Décret n°64-214 du 27 mai 1964

---

## 2. Adaptation des champs du schéma `document` (✅ Implémenté)

1. **`lieu_signature` & `signataires`** :
   - Ajoutés au schéma `api::document.document` (type string et text).
   - Mappés dans le contrôleur de documents (création, mise à jour, rendu).
   - Intégrés dans `AddDocs.jsx`, `EditDoc.jsx` et consultables sur `DocumentFiche.jsx`.
2. **Numéro optionnel (`numero`)** :
   - Rendue optionnelle dans le schéma pour permettre l'enregistrement de textes sans numéro officiel (notamment la **Constitution**).
3. **Date optionnelle (`date`)** :
   - Rendue optionnelle dans le schéma pour débloquer l'insertion d'actes dont la date d'adoption/signature est inconnue ou absente du document d'archive (ex. **Arrêté n°3091**).

