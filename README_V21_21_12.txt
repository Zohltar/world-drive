WORLD DRIVE V21.21.12 — FORCE-COUPLED DRIFT CANDIDATE

Base: V21.21.11 candidate.

OBJECTIF
Le frein à main doit pouvoir réellement faire décrocher l'arrière en virage,
sans ajouter une rotation artificielle en ligne droite.

CORRECTION
V21.21.11 créait déjà un moment de lacet quand l'essieu arrière perdait son
grip, mais la direction de déplacement du centre de masse continuait encore à
suivre trop rapidement le châssis. Le résultat était visible mais insuffisant
pour obtenir un vrai breakaway.

V21.21.12 couple maintenant le cercle de friction aux deux composantes:
- rotation du châssis via le moment de lacet des forces d'essieu;
- trajectoire du centre de masse via la force latérale nette réellement restante.

Quand le frein à main bloque l'arrière en virage:
- la force latérale arrière chute;
- le moment stabilisateur arrière disparaît;
- le châssis conserve davantage son inertie de lacet;
- la trajectoire tourne moins vite que le nez de la voiture;
- un angle de dérive réel apparaît.

Aucun `handbrake => yaw` artificiel n'est ajouté. Sans demande latérale,
le frein à main ne crée ni lacet ni dérive latérale.

PERFORMANCE
Le calcul supplémentaire se trouve dans le solveur pneus secondaire (20 Hz),
pas dans la boucle complète à chaque frame. Le microbenchmark local montre un
surcoût de quelques pourcents uniquement dans ce petit solveur, donc négligeable
à l'échelle du rendu complet.

STATUT
Candidate de test. Ne pas promouvoir baseline avant validation visuelle et feeling.
