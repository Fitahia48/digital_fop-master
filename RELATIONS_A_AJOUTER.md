# RELATIONS À AJOUTER

*Ce fichier liste les relations et observations en attente de validation ou d'adaptation du schéma Strapi.*

## Relations "vise" manquantes (type_relation : "vise" non disponible)

### Depuis le Décret n°2024-055
- VISE → Loi n°94-025 (Document 2)
- VISE → Loi n°2003-011 du 3 septembre 2003
- VISE → Loi n°2003-044 du 28 juillet 2004 (Code du Travail)
- VISE → Décret n°76-132 du 31 mars 1976
- VISE → Décret n°2015-1331 du 28 septembre 2015
- VISE → Décret n°2024-007 du 4 janvier 2024
- VISE → Décret n°2024-020 du 14 janvier 2024
- VISE → Constitution

### Depuis l'Arrêté n°3091
- VISE → Décret n°64-213 du 27 mai 1964
- VISE → Décret n°64-214 du 27 mai 1964

## Observations sur les données non représentables ou incertaines

### Décret n°2024-055
- **Particularité juridique** : L'article 56 précise une entrée en vigueur dès diffusion radio/télévisée, avant même la publication au Journal Officiel.
- **Champ manquant** : `lieu_signature` (Antananarivo) n'existe pas dans le modèle actuel.
- **Champ manquant** : `signataires` n'existe pas.

### Loi n°94-025
- **Écart de date** : Date d'adoption = 11 octobre 1994, mais citée comme "17 novembre 1994" dans le décret de 2024.
- **Champ manquant** : `signataires` n'existe pas.

### Arrêté n°3091
- **Date inconnue** : La date du document n'est pas présente dans le PDF. Le champ `date` de Strapi étant requis, cela pose un problème bloquant pour l'insertion.
- **Statut à vérifier** : Statut défini à "non_verifie" par défaut.

### Constitution (Enregistrement minimal)
- **Numéro manquant** : Le champ `numero` est requis dans le schéma, mais la Constitution n'en possède généralement pas.
