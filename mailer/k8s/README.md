# Deploying the mailer

The service is one stateless pod with no storage. What it needs from the cluster
is outbound TCP/587 and one HTTPS route the edge can reach.

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
  --from-literal=MAILER_AUTH_SECRET='…'
```

`MAILER_AUTH_SECRET` must be byte-identical to `KCHAT_MAILER_SECRET` on the edge —
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

The per-recipient rate limit is a `Map` in process memory (`src/handler.ts`). Two
replicas mean two independent counters, so an inbox can receive twice the cap per
hour. `maxSurge: 0` keeps that true during rollouts too, at the cost of a few
seconds of downtime — acceptable for a service the edge calls a handful of times
a day. Move the counter to a shared store before raising the replica count.

## Cost note

The free Infomaniak control plane covers the control plane only. The worker node,
the public IP and the LoadBalancer in front of the ingress controller are billed
at standard Public Cloud rates. Run one ingress controller for the whole cluster
rather than a `type: LoadBalancer` Service per app — hence the ClusterIP here.
