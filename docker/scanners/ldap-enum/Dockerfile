# ldap-enum: anonymous LDAP RootDSE enumeration via ldapsearch (openldap-clients).
FROM alpine:3.20
RUN apk add --no-cache openldap-clients ca-certificates \
 && adduser -D -u 10001 scanner
USER scanner
WORKDIR /home/scanner
ENTRYPOINT []
