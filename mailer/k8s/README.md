# Deploying the mailer

The service is one pod. What it needs from the cluster is outbound TCP/587 and one
HTTPS route the edge can reach - and, once it issues free licences, **storage**: the
ledger of issued licences (`LICENSE_LEDGER_PATH`, `/app/data` in the image) is what
keeps the free tier at one licence per organisation. `deployment.yaml` mounts an
`emptyDir` there, which forgets every licence when the pod goes; replace it with a
PersistentVolumeClaim before setting `FREE_LICENSE_KEY_B64`.

## 1. Build and push

```
docker build -t registry.example.com/vallus/mailer:0.1.0 .
docker push  registry.example.com/vallus/mailer:0.1.0
```

Point `images:` in `kustomization.yaml` at your registry. On Infomaniak that is
usually a private registry plus an `imagePullSecret` on the ServiceAccount.

## 2. Create the Secret out of band

Never in the repo:

```
kubectl -n vallus create secret generic mailer-secrets \
  --from-literal=SMTP_PASS='…' \
  --from-literal=MAILER_AUTH_SECRET='…' \
  --from-literal=FREE_LICENSE_KEY_B64="$(base64 < free-private.pem | tr -d '\n')"
```

`FREE_LICENSE_KEY_B64` is the **free** signing key only (never `private.pem`). Leave
it out and `POST /send-license` answers 404 - the mailer keeps sending codes exactly
as before.

`MAILER_AUTH_SECRET` must be byte-identical to `KCHAT_MAILER_SECRET` on the edge -
a mismatch shows up as a uniform `401 bad_signature`, not as a partial failure.

## 3. Apply

```
kubectl create namespace vallus
kubectl apply -k k8s/
```

`envFrom` does not reload, so after editing the ConfigMap:

```
kubectl -n vallus rollout restart deploy/mailer
```

## 4. Verify the SMTP egress

The single test that matters, because it is the one thing the cluster's network
can silently break. From inside the pod:

```
kubectl -n vallus exec deploy/mailer -- node dist/probe.js you@example.com
```

A hang rather than an error means egress on 587 is filtered. `kubectl logs` also
prints `SMTP login OK` (or `FAILED`) a second after startup.

## Why replicas: 1

Two reasons, and the second is binding. The per-recipient rate limit is a `Map` in
process memory (`src/handler.ts`), so two replicas mean two counters and an inbox can
receive twice the cap per hour. More importantly the **licence ledger is a file** that
each instance reads at startup and appends to under its own lock (`src/ledger.ts`):
two replicas would each see half the history and both issue a key to the same company.
`maxSurge: 0` keeps this true during rollouts too, at the cost of a few seconds of
downtime - acceptable for a service the edge calls a handful of times a day. Both the
counter and the ledger need a shared store before the replica count can rise.

## Cost note

The free Infomaniak control plane covers the control plane only. The worker node,
the public IP and the LoadBalancer in front of the ingress controller are billed
at standard Public Cloud rates. Run one ingress controller for the whole cluster
rather than a `type: LoadBalancer` Service per app - hence the ClusterIP here.
