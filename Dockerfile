# Local testing image only. On AWS the site runs on Amazon Linux 2023 with
# httpd installed by dnf and this repo cloned into /var/www/html.
FROM httpd:2.4

# Match the EC2 setup: let .htaccess work in the web root, and load
# mod_headers for the instance.json no-cache rule.
RUN sed -i \
        -e '/<Directory "\/usr\/local\/apache2\/htdocs">/,/<\/Directory>/ s/AllowOverride None/AllowOverride All/' \
        -e 's/^#\(LoadModule headers_module\)/\1/' \
        /usr/local/apache2/conf/httpd.conf
