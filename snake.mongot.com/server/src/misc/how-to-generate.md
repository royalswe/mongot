openssl req -x509 -out localhost.crt -keyout localhost.key \
 -newkey rsa:2048 -nodes -sha256 \
 -subj '/CN=localhost' -extensions EXT -config <( \
 printf "[dn]\nCN=localhost\n[req]\ndistinguished_name = dn\n[EXT]\nsubjectAltName=DNS:localhost\nkeyUsage=digitalSignature\nextendedKeyUsage=serverAuth")

The server generates a trusted development certificate in the ignored repository-level
`.local-certs/` directory before starting. Install [mkcert](https://github.com/FiloSottile/mkcert#installation)
once on your development machine; the certificate is renewed automatically before expiry.
